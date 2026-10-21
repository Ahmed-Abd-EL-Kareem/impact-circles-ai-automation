import { describe, it } from "node:test";
import assert from "node:assert";

interface ExpenseStub {
  amount: string | null;
  currency: string | null;
  validationStatus: string;
  category: string;
}

function calculateFinanceSummary(expenses: ExpenseStub[]) {
  let needsReviewCount = 0;
  let validCount = 0;
  let duplicateSuspectedCount = 0;

  const currencyMap = new Map<string, { count: number; total: number }>();
  const categoryMap = new Map<string, number>();

  for (const exp of expenses) {
    if (exp.validationStatus === "valid") validCount++;
    if (
      exp.validationStatus === "needs_review" ||
      exp.validationStatus === "duplicate_suspected"
    ) {
      needsReviewCount++;
    }
    if (exp.validationStatus === "duplicate_suspected") {
      duplicateSuspectedCount++;
    }

    // Category count
    categoryMap.set(exp.category, (categoryMap.get(exp.category) || 0) + 1);

    // Currency grouping (STRICTLY separate; no cross-currency addition)
    if (exp.currency && exp.amount) {
      const parsed = parseFloat(exp.amount);
      if (!isNaN(parsed)) {
        const curr = exp.currency.toUpperCase();
        const existing = currencyMap.get(curr) || { count: 0, total: 0 };
        currencyMap.set(curr, {
          count: existing.count + 1,
          total: existing.total + parsed,
        });
      }
    }
  }

  const byCurrency = Array.from(currencyMap.entries())
    .map(([currency, data]) => ({
      currency,
      count: data.count,
      totalAmount: data.total.toFixed(2),
    }))
    .sort((a, b) => b.count - a.count);

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalExpenses: expenses.length,
    needsReviewCount,
    validCount,
    duplicateSuspectedCount,
    byCurrency,
    byCategory,
  };
}

describe("Finance Summary & Currency Grouping", () => {
  it("groups amounts strictly by currency without cross-currency addition", () => {
    const expenses: ExpenseStub[] = [
      { amount: "100.00", currency: "USD", validationStatus: "valid", category: "software" },
      { amount: "50.00", currency: "USD", validationStatus: "valid", category: "software" },
      { amount: "200.00", currency: "EUR", validationStatus: "needs_review", category: "travel" },
      { amount: "1500.00", currency: "EGP", validationStatus: "duplicate_suspected", category: "operational" },
    ];

    const summary = calculateFinanceSummary(expenses);

    assert.strictEqual(summary.totalExpenses, 4);
    assert.strictEqual(summary.validCount, 2);
    assert.strictEqual(summary.needsReviewCount, 2); // needs_review (1) + duplicate_suspected (1)
    assert.strictEqual(summary.duplicateSuspectedCount, 1);

    // Verify USD group
    const usdGroup = summary.byCurrency.find((c) => c.currency === "USD");
    assert.ok(usdGroup);
    assert.strictEqual(usdGroup?.count, 2);
    assert.strictEqual(usdGroup?.totalAmount, "150.00");

    // Verify EUR group
    const eurGroup = summary.byCurrency.find((c) => c.currency === "EUR");
    assert.ok(eurGroup);
    assert.strictEqual(eurGroup?.count, 1);
    assert.strictEqual(eurGroup?.totalAmount, "200.00");

    // Verify EGP group
    const egpGroup = summary.byCurrency.find((c) => c.currency === "EGP");
    assert.ok(egpGroup);
    assert.strictEqual(egpGroup?.count, 1);
    assert.strictEqual(egpGroup?.totalAmount, "1500.00");

    // Verify that NO combined grand total was produced
    assert.strictEqual((summary as any).grandTotal, undefined);
  });

  it("handles empty expense list without crashing", () => {
    const summary = calculateFinanceSummary([]);
    assert.strictEqual(summary.totalExpenses, 0);
    assert.strictEqual(summary.needsReviewCount, 0);
    assert.strictEqual(summary.validCount, 0);
    assert.strictEqual(summary.byCurrency.length, 0);
    assert.strictEqual(summary.byCategory.length, 0);
  });
});
