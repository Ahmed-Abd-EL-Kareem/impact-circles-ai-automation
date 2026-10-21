import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { FinanceSummaryData, ExpenseCategory } from "@/lib/types/expense";

/**
 * GET /api/finance/summary
 * Derives financial statistics from persisted records in Neon PostgreSQL.
 * Aggregates totals strictly grouped by currency without cross-currency addition.
 */
export async function GET() {
  try {
    const [
      totalExpenses,
      needsReviewCount,
      validCount,
      duplicateSuspectedCount,
      currencyGroups,
      categoryGroups,
    ] = await Promise.all([
      prisma.expense.count(),
      prisma.expense.count({
        where: {
          validationStatus: { in: ["needs_review", "duplicate_suspected"] },
        },
      }),
      prisma.expense.count({
        where: { validationStatus: "valid" },
      }),
      prisma.expense.count({
        where: { validationStatus: "duplicate_suspected" },
      }),
      prisma.expense.groupBy({
        by: ["currency"],
        _count: { id: true },
        _sum: { amount: true },
        where: {
          currency: { not: null },
          amount: { gt: 0 },
          validationStatus: { not: "failed" },
        },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        _count: { id: true },
      }),
    ]);

    const byCurrency = currencyGroups
      .filter((g) => g.currency !== null)
      .map((g) => ({
        currency: g.currency as string,
        count: g._count.id,
        totalAmount: g._sum.amount ? g._sum.amount.toFixed(2) : "0.00",
      }))
      .sort((a, b) => b.count - a.count);

    const byCategory = categoryGroups.map((g) => ({
      category: g.category as ExpenseCategory,
      count: g._count.id,
    })).sort((a, b) => b.count - a.count);

    const summary: FinanceSummaryData = {
      totalExpenses,
      needsReviewCount,
      validCount,
      duplicateSuspectedCount,
      byCurrency,
      byCategory,
    };

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to generate summary";
    return NextResponse.json(
      {
        success: false,
        error: `Database summary calculation error: ${message}`,
      },
      { status: 500 }
    );
  }
}
