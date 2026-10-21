import { prisma } from "../db.ts";
import { Prisma } from "@prisma/client";

export interface DuplicateCheckParams {
  vendor: string | null;
  invoiceNumber: string | null;
  expenseDate: Date | null;
  amount: string | null;
  currency: string | null;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType?: "primary" | "weaker";
  existingExpenseId?: string;
  reason?: string;
}

/**
 * Checks database for duplicate candidates based on:
 * 1. Primary: Same vendor + invoiceNumber + amount + currency.
 * 2. Weaker (when invoiceNumber is missing): Same vendor + expenseDate + amount + currency.
 */
export async function checkForDuplicateExpense(
  params: DuplicateCheckParams
): Promise<DuplicateCheckResult> {
  const { vendor, invoiceNumber, expenseDate, amount, currency } = params;

  if (!vendor || !amount || !currency) {
    return { isDuplicate: false };
  }

  const decimalAmount = new Prisma.Decimal(amount);

  // 1. Primary candidate check (vendor + invoiceNumber + amount + currency)
  if (invoiceNumber && invoiceNumber.trim()) {
    const primaryMatch = await prisma.expense.findFirst({
      where: {
        vendor: { equals: vendor.trim(), mode: "insensitive" },
        invoiceNumber: { equals: invoiceNumber.trim(), mode: "insensitive" },
        amount: decimalAmount,
        currency: { equals: currency.trim(), mode: "insensitive" },
      },
      select: { id: true, invoiceNumber: true, vendor: true },
    });

    if (primaryMatch) {
      return {
        isDuplicate: true,
        matchType: "primary",
        existingExpenseId: primaryMatch.id,
        reason: `Matches existing expense #${primaryMatch.id} with same vendor (${vendor}), invoice #${invoiceNumber}, amount (${amount}), and currency (${currency}).`,
      };
    }
  }

  // 2. Weaker candidate check (when invoiceNumber is missing: vendor + expenseDate + amount + currency)
  if (!invoiceNumber && expenseDate) {
    // Check expenses on the same calendar day
    const startOfDay = new Date(expenseDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(expenseDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const weakerMatch = await prisma.expense.findFirst({
      where: {
        vendor: { equals: vendor.trim(), mode: "insensitive" },
        amount: decimalAmount,
        currency: { equals: currency.trim(), mode: "insensitive" },
        expenseDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: { id: true, expenseDate: true, vendor: true },
    });

    if (weakerMatch) {
      return {
        isDuplicate: true,
        matchType: "weaker",
        existingExpenseId: weakerMatch.id,
        reason: `Matches existing expense #${weakerMatch.id} with same vendor (${vendor}), date (${expenseDate.toISOString().slice(0, 10)}), amount (${amount}), and currency (${currency}).`,
      };
    }
  }

  return { isDuplicate: false };
}
