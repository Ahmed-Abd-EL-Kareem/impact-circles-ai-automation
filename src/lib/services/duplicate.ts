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
 * 1. Primary: Same vendor (case-insensitive) + non-empty invoiceNumber (case-insensitive) + amount + currency.
 * 2. Secondary (ONLY when incoming invoiceNumber is missing): Same vendor (case-insensitive) + same calendar date + amount + currency + existing record also lacks invoiceNumber.
 *
 * Guaranteed invariants:
 * - If incoming document has an invoice number, weaker date-based match is NEVER evaluated.
 * - Records with missing vendor, amount, or currency are never treated as matches.
 * - Database errors are not masked as false negatives.
 */
export async function checkForDuplicateExpense(
  params: DuplicateCheckParams
): Promise<DuplicateCheckResult> {
  const { vendor, invoiceNumber, expenseDate, amount, currency } = params;

  if (
    !vendor ||
    !vendor.trim() ||
    !amount ||
    !amount.trim() ||
    !currency ||
    !currency.trim()
  ) {
    return { isDuplicate: false };
  }

  let decimalAmount: Prisma.Decimal;
  try {
    decimalAmount = new Prisma.Decimal(amount.trim());
  } catch {
    return { isDuplicate: false };
  }

  const trimmedVendor = vendor.trim();
  const trimmedCurrency = currency.trim().toUpperCase();
  const trimmedInvoice = invoiceNumber ? invoiceNumber.trim() : "";

  // 1. Primary candidate check (vendor + invoiceNumber + amount + currency)
  if (trimmedInvoice.length > 0) {
    const primaryMatch = await prisma.expense.findFirst({
      where: {
        vendor: { equals: trimmedVendor, mode: "insensitive" },
        invoiceNumber: { equals: trimmedInvoice, mode: "insensitive" },
        amount: decimalAmount,
        currency: { equals: trimmedCurrency, mode: "insensitive" },
      },
      select: { id: true, invoiceNumber: true, vendor: true },
      orderBy: { createdAt: "desc" },
    });

    if (primaryMatch) {
      return {
        isDuplicate: true,
        matchType: "primary",
        existingExpenseId: primaryMatch.id,
        reason: `Matches existing expense #${primaryMatch.id} with same vendor (${trimmedVendor}), invoice #${trimmedInvoice}, amount (${amount}), and currency (${trimmedCurrency}).`,
      };
    }

    // Do NOT fall back to date-based match when incoming invoice number exists
    return { isDuplicate: false };
  }

  // 2. Secondary candidate check (only when incoming invoiceNumber is missing/empty)
  if (expenseDate) {
    const startOfDay = new Date(expenseDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(expenseDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const weakerMatch = await prisma.expense.findFirst({
      where: {
        vendor: { equals: trimmedVendor, mode: "insensitive" },
        invoiceNumber: null, // Existing record must ALSO lack an invoice number
        amount: decimalAmount,
        currency: { equals: trimmedCurrency, mode: "insensitive" },
        expenseDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      select: { id: true, expenseDate: true, vendor: true },
      orderBy: { createdAt: "desc" },
    });

    if (weakerMatch) {
      const dateStr = expenseDate.toISOString().slice(0, 10);
      return {
        isDuplicate: true,
        matchType: "weaker",
        existingExpenseId: weakerMatch.id,
        reason: `Matches existing unnumbered expense #${weakerMatch.id} with same vendor (${trimmedVendor}), calendar date (${dateStr}), amount (${amount}), and currency (${trimmedCurrency}).`,
      };
    }
  }

  return { isDuplicate: false };
}
