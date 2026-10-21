import { validateFileBuffer } from "../validation/file.ts";
import { extractWithGemini } from "../extraction/gemini.ts";
import { validateExtractedExpense } from "../validation/extraction.ts";
import { checkForDuplicateExpense } from "./duplicate.ts";
import { prisma } from "../db.ts";
import type { ExpenseRecord, ValidationIssue } from "../types/expense.ts";
import { Prisma } from "@prisma/client";

export interface DirectPipelineParams {
  buffer: Buffer;
  fileName: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
}

export type DirectPipelineResult =
  | { success: true; expense: ExpenseRecord }
  | { success: false; error: string };

/**
 * Direct execution pipeline used for end-to-end integration tests and direct verification.
 * Follows the identical sequence as the n8n workflow:
 * Validate -> Gemini Extract -> Validate Structure -> Check Duplicate -> Persist Expense.
 */
export async function executeDocumentPipelineDirect(
  params: DirectPipelineParams
): Promise<DirectPipelineResult> {
  // 1. Validate file buffer & magic bytes
  const fileCheck = validateFileBuffer(params.buffer, params.fileName);
  if (!fileCheck.success) {
    return { success: false, error: fileCheck.error };
  }

  // 2. Call Gemini
  const geminiResult = await extractWithGemini(
    params.buffer,
    fileCheck.file.mimeType
  );
  if (!geminiResult.success) {
    return { success: false, error: geminiResult.error };
  }

  // 3. Server-side validation of extraction
  const validated = validateExtractedExpense(
    geminiResult.data,
    fileCheck.file.fileName
  );

  // 4. Duplicate check against Neon database
  const dupCheck = await checkForDuplicateExpense({
    vendor: validated.vendor,
    invoiceNumber: validated.invoiceNumber,
    expenseDate: validated.expenseDate,
    amount: validated.amount,
    currency: validated.currency,
  });

  let finalStatus = validated.validationStatus;
  const issues: ValidationIssue[] = [...validated.validationIssues];

  if (dupCheck.isDuplicate) {
    finalStatus = "duplicate_suspected";
    issues.push({
      code: "DUPLICATE_SUSPECTED",
      message: dupCheck.reason || "Suspected duplicate of an existing expense.",
      severity: "warning",
    });
  }

  // 5. Persist to Neon Postgres via Prisma
  const created = await prisma.expense.create({
    data: {
      expenseDate: validated.expenseDate,
      vendor: validated.vendor,
      invoiceNumber: validated.invoiceNumber,
      description: validated.description,
      amount: validated.amount ? new Prisma.Decimal(validated.amount) : null,
      currency: validated.currency,
      taxAmount: validated.taxAmount
        ? new Prisma.Decimal(validated.taxAmount)
        : null,
      category: validated.category,
      validationStatus: finalStatus,
      validationIssues: issues as unknown as Prisma.InputJsonValue,
      sourceFileName: validated.sourceFileName,
    },
  });

  return {
    success: true,
    expense: {
      id: created.id,
      expenseDate: created.expenseDate
        ? created.expenseDate.toISOString().slice(0, 10)
        : null,
      vendor: created.vendor,
      invoiceNumber: created.invoiceNumber,
      description: created.description,
      amount: created.amount ? created.amount.toString() : null,
      currency: created.currency,
      taxAmount: created.taxAmount ? created.taxAmount.toString() : null,
      category: created.category as ExpenseRecord["category"],
      validationStatus: created.validationStatus as ExpenseRecord["validationStatus"],
      validationIssues: issues,
      sourceFileName: created.sourceFileName,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  };
}
