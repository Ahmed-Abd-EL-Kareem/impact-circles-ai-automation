import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ExpenseCategory, ValidationStatus } from "@/lib/types/expense";
import { Prisma } from "@prisma/client";

export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = typeof val === "string" ? val : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateExpenseCsv(
  expenses: Array<{
    id: string;
    expenseDate: Date | null;
    vendor: string | null;
    invoiceNumber: string | null;
    description: string | null;
    category: string;
    amount: { toString(): string } | null;
    currency: string | null;
    subtotalAmount: { toString(): string } | null;
    taxAmount: { toString(): string } | null;
    validationStatus: string;
    validationIssues: unknown;
    sourceFileName: string;
    createdAt: Date;
  }>
): string {
  const headers = [
    "ID",
    "Date",
    "Vendor",
    "Invoice Number",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Subtotal",
    "Tax",
    "Validation Status",
    "Validation Issues Count",
    "Source File Name",
    "Created At",
  ];

  const rows = expenses.map((e) => {
    let issuesCount = 0;
    if (Array.isArray(e.validationIssues)) {
      issuesCount = e.validationIssues.length;
    } else if (typeof e.validationIssues === "string") {
      try {
        issuesCount = JSON.parse(e.validationIssues).length;
      } catch {
        issuesCount = 0;
      }
    }

    return [
      escapeCsvField(e.id),
      escapeCsvField(e.expenseDate ? e.expenseDate.toISOString().slice(0, 10) : ""),
      escapeCsvField(e.vendor || ""),
      escapeCsvField(e.invoiceNumber || ""),
      escapeCsvField(e.description || ""),
      escapeCsvField(e.category),
      escapeCsvField(e.amount ? e.amount.toString() : ""),
      escapeCsvField(e.currency || ""),
      escapeCsvField(e.subtotalAmount ? e.subtotalAmount.toString() : ""),
      escapeCsvField(e.taxAmount ? e.taxAmount.toString() : ""),
      escapeCsvField(e.validationStatus),
      escapeCsvField(issuesCount),
      escapeCsvField(e.sourceFileName),
      escapeCsvField(e.createdAt.toISOString()),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") as ValidationStatus | null;
    const category = searchParams.get("category") as ExpenseCategory | null;

    const where: Prisma.ExpenseWhereInput = {};
    if (status && status !== ("all" as unknown)) {
      where.validationStatus = status;
    }
    if (category && category !== ("all" as unknown)) {
      where.category = category;
    }

    const expenses = await prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const csvContent = generateExpenseCsv(expenses);

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="expenses.csv"',
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to export expenses CSV";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
