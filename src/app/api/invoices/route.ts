import { NextRequest, NextResponse } from "next/server";
import { validateFileBuffer } from "@/lib/validation/file";
import { dispatchToN8nWorkflow } from "@/lib/services/workflow-client";
import { prisma } from "@/lib/db";
import { ExpenseCategory, ValidationStatus } from "@/lib/types/expense";

/**
 * POST /api/invoices
 * Accepts document upload (PDF, PNG, JPEG), validates on server,
 * and orchestrates processing via the n8n automation workflow.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Content-Type. Expected multipart/form-data with a 'file' field.",
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "No file was uploaded. Please attach a PDF, PNG, or JPEG file under key 'file'.",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate file bounds and genuine magic bytes
    const validationResult = validateFileBuffer(buffer, file.name);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: validationResult.error,
        },
        { status: 400 }
      );
    }

    const validatedFile = validationResult.file;

    // Dispatch to n8n automation workflow
    const result = await dispatchToN8nWorkflow({
      buffer: validatedFile.buffer,
      fileName: validatedFile.fileName,
      mimeType: validatedFile.mimeType,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: result.statusCode || 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        expense: result.expense,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      {
        success: false,
        error: `Unexpected server error during document processing: ${message}`,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/invoices
 * Returns persisted expenses from Neon PostgreSQL with pagination and filtering.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));
    const status = searchParams.get("status") as ValidationStatus | null;
    const category = searchParams.get("category") as ExpenseCategory | null;

    const where: {
      validationStatus?: string;
      category?: string;
    } = {};

    if (
      status &&
      ["valid", "needs_review", "duplicate_suspected", "processing_failed"].includes(status)
    ) {
      where.validationStatus = status;
    }

    if (
      category &&
      [
        "personnel",
        "travel",
        "equipment",
        "software",
        "events",
        "operational",
        "uncategorized",
      ].includes(category)
    ) {
      where.category = category;
    }

    const skip = (page - 1) * limit;

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    const formattedExpenses = expenses.map((e) => ({
      id: e.id,
      expenseDate: e.expenseDate ? e.expenseDate.toISOString().slice(0, 10) : null,
      vendor: e.vendor,
      invoiceNumber: e.invoiceNumber,
      description: e.description,
      amount: e.amount ? e.amount.toString() : null,
      currency: e.currency,
      taxAmount: e.taxAmount ? e.taxAmount.toString() : null,
      category: e.category,
      validationStatus: e.validationStatus,
      validationIssues: Array.isArray(e.validationIssues)
        ? e.validationIssues
        : typeof e.validationIssues === "string"
        ? JSON.parse(e.validationIssues)
        : [],
      sourceFileName: e.sourceFileName,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: formattedExpenses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch expenses";
    return NextResponse.json(
      {
        success: false,
        error: `Database query error: ${message}`,
      },
      { status: 500 }
    );
  }
}
