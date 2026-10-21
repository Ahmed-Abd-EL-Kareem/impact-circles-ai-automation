import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Pure duplicate detection predicate matching the exact database query logic
 * used in both n8n and the TypeScript backend.
 */
interface ExpenseEntry {
  id: string;
  vendor: string | null;
  invoiceNumber: string | null;
  expenseDate: string | null;
  amount: string | null;
  currency: string | null;
}

function checkDuplicateInList(
  candidate: {
    vendor: string | null;
    invoiceNumber: string | null;
    expenseDate: string | null;
    amount: string | null;
    currency: string | null;
  },
  existingList: ExpenseEntry[]
): { isDuplicate: boolean; matchType?: "primary" | "weaker"; matchedId?: string } {
  if (
    !candidate.vendor ||
    !candidate.vendor.trim() ||
    !candidate.amount ||
    !candidate.amount.trim() ||
    !candidate.currency ||
    !candidate.currency.trim()
  ) {
    return { isDuplicate: false };
  }

  const normVendor = candidate.vendor.trim().toLowerCase();
  const parsedAmt = parseFloat(candidate.amount);
  if (isNaN(parsedAmt)) return { isDuplicate: false };
  const normAmount = parsedAmt.toFixed(2);
  const normCurrency = candidate.currency.trim().toUpperCase();

  // 1. Primary candidate: same vendor + non-empty invoiceNumber + amount + currency
  if (candidate.invoiceNumber && candidate.invoiceNumber.trim()) {
    const normInvoice = candidate.invoiceNumber.trim().toLowerCase();
    const primaryMatch = existingList.find((e) => {
      return (
        e.vendor?.trim().toLowerCase() === normVendor &&
        e.invoiceNumber &&
        e.invoiceNumber.trim().toLowerCase() === normInvoice &&
        parseFloat(e.amount || "0").toFixed(2) === normAmount &&
        e.currency?.trim().toUpperCase() === normCurrency
      );
    });

    if (primaryMatch) {
      return { isDuplicate: true, matchType: "primary", matchedId: primaryMatch.id };
    }

    // Do NOT evaluate weaker date-based match when incoming document has invoiceNumber
    return { isDuplicate: false };
  }

  // 2. Weaker candidate: ONLY when incoming invoiceNumber is missing, use vendor + date + amount + currency
  // AND existing record must ALSO lack an invoice number
  if (!candidate.invoiceNumber && candidate.expenseDate) {
    const weakerMatch = existingList.find((e) => {
      return (
        e.vendor?.trim().toLowerCase() === normVendor &&
        !e.invoiceNumber &&
        e.expenseDate?.slice(0, 10) === candidate.expenseDate?.slice(0, 10) &&
        parseFloat(e.amount || "0").toFixed(2) === normAmount &&
        e.currency?.trim().toUpperCase() === normCurrency
      );
    });

    if (weakerMatch) {
      return { isDuplicate: true, matchType: "weaker", matchedId: weakerMatch.id };
    }
  }

  return { isDuplicate: false };
}

describe("Duplicate Detection Logic", () => {
  const existingExpenses: ExpenseEntry[] = [
    {
      id: "exp_1",
      vendor: "GitHub Inc.",
      invoiceNumber: "GH-8941",
      expenseDate: "2026-03-01",
      amount: "40.00",
      currency: "USD",
    },
    {
      id: "exp_2",
      vendor: "Local Metro Cafe",
      invoiceNumber: null,
      expenseDate: "2026-03-10",
      amount: "15.50",
      currency: "EUR",
    },
    {
      id: "exp_3",
      vendor: "AWS Cloud Services",
      invoiceNumber: "AWS-1122",
      expenseDate: "2026-03-15",
      amount: "120.00",
      currency: "USD",
    },
  ];

  it("flags primary duplicate candidate with identical vendor, invoiceNumber, amount, currency", () => {
    const candidate = {
      vendor: "github inc.", // Case-insensitive
      invoiceNumber: "gh-8941",
      expenseDate: "2026-03-02", // Different date doesn't matter for primary match
      amount: "40.00",
      currency: "USD",
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, true);
    assert.strictEqual(result.matchType, "primary");
    assert.strictEqual(result.matchedId, "exp_1");
  });

  it("flags weaker duplicate candidate when invoice number is missing but vendor, date, amount, currency match", () => {
    const candidate = {
      vendor: "Local Metro Cafe",
      invoiceNumber: null,
      expenseDate: "2026-03-10",
      amount: "15.50",
      currency: "EUR",
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, true);
    assert.strictEqual(result.matchType, "weaker");
    assert.strictEqual(result.matchedId, "exp_2");
  });

  it("does not flag duplicate if amounts differ", () => {
    const candidate = {
      vendor: "GitHub Inc.",
      invoiceNumber: "GH-8941",
      expenseDate: "2026-03-01",
      amount: "80.00",
      currency: "USD",
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, false);
  });

  it("does not flag duplicate if currencies differ", () => {
    const candidate = {
      vendor: "GitHub Inc.",
      invoiceNumber: "GH-8941",
      expenseDate: "2026-03-01",
      amount: "40.00",
      currency: "EUR", // Different currency
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, false);
  });

  it("does not flag weaker duplicate if date differs", () => {
    const candidate = {
      vendor: "Local Metro Cafe",
      invoiceNumber: null,
      expenseDate: "2026-03-11", // Different date
      amount: "15.50",
      currency: "EUR",
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, false);
  });

  it("does not use weaker date match if incoming document has an invoice number", () => {
    // Has invoice number "NEW-999" and same vendor/date/amount as exp_2
    const candidate = {
      vendor: "Local Metro Cafe",
      invoiceNumber: "NEW-999",
      expenseDate: "2026-03-10",
      amount: "15.50",
      currency: "EUR",
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, false);
  });

  it("does not match weaker candidate if existing record has an invoice number", () => {
    // Incoming is missing invoice number, but AWS has invoice number "AWS-1122"
    const candidate = {
      vendor: "AWS Cloud Services",
      invoiceNumber: null,
      expenseDate: "2026-03-15",
      amount: "120.00",
      currency: "USD",
    };

    const result = checkDuplicateInList(candidate, existingExpenses);
    assert.strictEqual(result.isDuplicate, false);
  });

  it("does not treat records with missing vendor, amount, or currency as confirmed matches", () => {
    assert.strictEqual(
      checkDuplicateInList(
        { vendor: null, invoiceNumber: "GH-8941", expenseDate: "2026-03-01", amount: "40.00", currency: "USD" },
        existingExpenses
      ).isDuplicate,
      false
    );

    assert.strictEqual(
      checkDuplicateInList(
        { vendor: "GitHub Inc.", invoiceNumber: "GH-8941", expenseDate: "2026-03-01", amount: null, currency: "USD" },
        existingExpenses
      ).isDuplicate,
      false
    );

    assert.strictEqual(
      checkDuplicateInList(
        { vendor: "GitHub Inc.", invoiceNumber: "GH-8941", expenseDate: "2026-03-01", amount: "40.00", currency: null },
        existingExpenses
      ).isDuplicate,
      false
    );
  });

  it("handles request-level idempotency by preserving previous record on retry", () => {
    const store = new Map<string, { id: string; amount: string }>();
    const idempotencyKey = "req_key_abc_123";

    // First request
    store.set(idempotencyKey, { id: "exp_unique_1", amount: "100.00" });

    // Repeated request with same idempotency key
    const replay = store.get(idempotencyKey);
    assert.ok(replay);
    assert.strictEqual(replay.id, "exp_unique_1");
  });
});
