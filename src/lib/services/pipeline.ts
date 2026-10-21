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
  idempotencyKey?: string;
}

export type DirectPipelineResult =
  | { success: true; expense: ExpenseRecord }
  | { success: false; error: string };

function formatExpenseRecord(e: {
  id: string;
  idempotencyKey: string | null;
  expenseDate: Date | null;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  subtotalAmount: Prisma.Decimal | null;
  amount: Prisma.Decimal | null;
  currency: string | null;
  taxAmount: Prisma.Decimal | null;
  category: string;
  validationStatus: string;
  validationIssues: Prisma.JsonValue;
  sourceFileName: string;
  createdAt: Date;
  updatedAt: Date;
}): ExpenseRecord {
  return {
    id: e.id,
    idempotencyKey: e.idempotencyKey,
    expenseDate: e.expenseDate
      ? e.expenseDate.toISOString().slice(0, 10)
      : null,
    vendor: e.vendor,
    invoiceNumber: e.invoiceNumber,
    description: e.description,
    subtotalAmount: e.subtotalAmount ? e.subtotalAmount.toString() : null,
    amount: e.amount ? e.amount.toString() : null,
    currency: e.currency,
    taxAmount: e.taxAmount ? e.taxAmount.toString() : null,
    category: e.category as ExpenseRecord["category"],
    validationStatus: e.validationStatus as ExpenseRecord["validationStatus"],
    validationIssues: Array.isArray(e.validationIssues)
      ? (e.validationIssues as unknown as ValidationIssue[])
      : typeof e.validationIssues === "string"
      ? JSON.parse(e.validationIssues)
      : [],
    sourceFileName: e.sourceFileName,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/**
 * Direct execution pipeline used for testing and programmatic execution.
 * Follows the identical sequence as the n8n workflow:
 * Validate -> Gemini Extract -> Validate Structure -> Check Duplicate -> Persist Expense.
 */
export async function executeDocumentPipelineDirect(
  params: DirectPipelineParams
): Promise<DirectPipelineResult> {
  // 0. Request-level idempotency check
  if (params.idempotencyKey) {
    const existing = await prisma.expense.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) {
      return {
        success: true,
        expense: formatExpenseRecord(existing),
      };
    }
  }

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
    fileCheck.file.fileName,
    params.idempotencyKey
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
  try {
    const created = await prisma.expense.create({
      data: {
        idempotencyKey: params.idempotencyKey || null,
        expenseDate: validated.expenseDate,
        vendor: validated.vendor,
        invoiceNumber: validated.invoiceNumber,
        description: validated.description,
        subtotalAmount: validated.subtotalAmount
          ? new Prisma.Decimal(validated.subtotalAmount)
          : null,
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
      expense: formatExpenseRecord(created),
    };
  } catch (err: unknown) {
    // If concurrent insert with same idempotency key occurred, return existing
    if (
      params.idempotencyKey &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.expense.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        return {
          success: true,
          expense: formatExpenseRecord(existing),
        };
      }
    }
    throw err;
  }
}
