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
      categoryCurrencyGroups,
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
      prisma.expense.groupBy({
        by: ["category", "currency"],
        _count: { id: true },
        _sum: { amount: true },
        where: {
          currency: { not: null },
          amount: { gt: 0 },
          validationStatus: { not: "failed" },
        },
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

    const byCategoryAndCurrency = categoryCurrencyGroups
      .filter((g) => g.category !== null && g.currency !== null)
      .map((g) => ({
        category: g.category as ExpenseCategory,
        currency: g.currency as string,
        count: g._count.id,
        totalAmount: g._sum.amount ? g._sum.amount.toFixed(2) : "0.00",
      }))
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.currency.localeCompare(b.currency);
      });

    const summary: FinanceSummaryData = {
      totalExpenses,
      needsReviewCount,
      validCount,
      duplicateSuspectedCount,
      byCurrency,
      byCategory,
      byCategoryAndCurrency,
    };

    return NextResponse.json(
      {
        success: true,
        data: summary,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, stale-while-revalidate=30",
        },
      }
    );
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
