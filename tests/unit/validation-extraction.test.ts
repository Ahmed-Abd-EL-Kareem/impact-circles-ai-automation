import { describe, it } from "node:test";
import assert from "node:assert";
import {
  validateExtractedExpense,
  validateDecimalAmount,
  validateExpenseDate,
  normalizeCurrency,
  validateCategory,
} from "../../src/lib/validation/extraction.ts";

describe("Extraction Contract & Validation Logic", () => {
  it("validates a complete, consistent extraction output without errors", () => {
    const rawData = {
      expenseDate: "2026-03-15",
      vendor: "Acme Cloud Services",
      invoiceNumber: "INV-2026-001",
      description: "Monthly server hosting cluster",
      amount: "250.00",
      currency: "USD",
      taxAmount: "25.00",
      subtotalAmount: "225.00",
      category: "software",
      confidence: {
        expenseDate: 0.98,
        vendor: 0.95,
        amount: 0.99,
        currency: 0.99,
      },
      validationIssues: [],
    };

    const validated = validateExtractedExpense(rawData, "acme_invoice.pdf");

    assert.strictEqual(validated.validationStatus, "valid");
    assert.strictEqual(validated.vendor, "Acme Cloud Services");
    assert.strictEqual(validated.invoiceNumber, "INV-2026-001");
    assert.strictEqual(validated.amount, "250.00");
    assert.strictEqual(validated.currency, "USD");
    assert.strictEqual(validated.taxAmount, "25.00");
    assert.strictEqual(validated.category, "software");
    assert.strictEqual(validated.validationIssues.length, 0);
  });

  it("handles missing invoice fields honestly with nulls and marks status as needs_review", () => {
    const rawDataWithMissingFields = {
      expenseDate: null,
      vendor: null,
      invoiceNumber: null,
      description: "Coffee and supplies",
      amount: "45.50",
      currency: "EUR",
      taxAmount: null,
      category: "operational",
      validationIssues: [],
    };

    const validated = validateExtractedExpense(
      rawDataWithMissingFields,
      "coffee_receipt.png"
    );

    assert.strictEqual(validated.validationStatus, "needs_review");
    assert.strictEqual(validated.vendor, null);
    assert.strictEqual(validated.invoiceNumber, null);
    assert.strictEqual(validated.expenseDate, null);
    assert.strictEqual(validated.amount, "45.50");
    assert.strictEqual(validated.currency, "EUR");

    const issueCodes = validated.validationIssues.map((i) => i.code);
    assert.ok(issueCodes.includes("MISSING_VENDOR"));
    assert.ok(issueCodes.includes("MISSING_INVOICE_NUMBER"));
    assert.ok(issueCodes.includes("MISSING_DATE"));
  });

  it("rejects invalid date formats and impossible calendar dates", () => {
    const invalidFormat = validateExpenseDate("15/03/2026");
    assert.strictEqual(invalidFormat.date, null);
    assert.strictEqual(invalidFormat.issue?.code, "INVALID_DATE_FORMAT");

    const impossibleDate = validateExpenseDate("2026-02-31");
    assert.strictEqual(impossibleDate.date, null);
    assert.strictEqual(impossibleDate.issue?.code, "INVALID_CALENDAR_DATE");

    const nullDate = validateExpenseDate(null);
    assert.strictEqual(nullDate.date, null);
    assert.strictEqual(nullDate.issue?.code, "MISSING_DATE");
  });

  it("rejects invalid and negative amounts", () => {
    const negative = validateDecimalAmount("-50.00", "amount");
    assert.strictEqual(negative.amountStr, null);
    assert.strictEqual(negative.issue?.code, "NEGATIVE_AMOUNT");

    const notANumber = validateDecimalAmount("abc_invalid", "amount");
    assert.strictEqual(notANumber.amountStr, null);
    assert.strictEqual(notANumber.issue?.code, "INVALID_AMOUNT");

    const missingAmount = validateDecimalAmount(null, "amount");
    assert.strictEqual(missingAmount.amountStr, null);
    assert.strictEqual(missingAmount.issue?.code, "MISSING_AMOUNT");
  });

  it("normalizes common currency symbols to ISO codes and flags non-standard currencies", () => {
    const usd = normalizeCurrency("$");
    assert.strictEqual(usd.currency, "USD");

    const eur = normalizeCurrency("€");
    assert.strictEqual(eur.currency, "EUR");

    const gbp = normalizeCurrency("£");
    assert.strictEqual(gbp.currency, "GBP");

    const iso = normalizeCurrency("EGP");
    assert.strictEqual(iso.currency, "EGP");

    const nonStandard = normalizeCurrency("GOLD_COINS");
    assert.strictEqual(nonStandard.currency, "GOLD_COINS");
    assert.strictEqual(nonStandard.issue?.code, "NON_STANDARD_CURRENCY");
  });

  it("flags tax exceeding total amount as an error", () => {
    const rawData = {
      expenseDate: "2026-01-10",
      vendor: "Hotel Paris",
      invoiceNumber: "HTL-998",
      amount: "100.00",
      currency: "EUR",
      taxAmount: "120.00", // Tax > Total
      category: "travel",
      validationIssues: [],
    };

    const validated = validateExtractedExpense(rawData, "hotel.pdf");
    assert.strictEqual(validated.validationStatus, "needs_review");

    const taxIssue = validated.validationIssues.find(
      (i) => i.code === "TAX_EXCEEDS_TOTAL"
    );
    assert.ok(taxIssue);
    assert.strictEqual(taxIssue?.severity, "error");
  });

  it("flags discrepancy when subtotal + tax does not equal total amount", () => {
    const rawData = {
      expenseDate: "2026-02-20",
      vendor: "Hardware Supplies",
      invoiceNumber: "HW-441",
      amount: "100.00",
      taxAmount: "10.00",
      subtotalAmount: "80.00", // 80 + 10 = 90 !== 100
      currency: "USD",
      category: "equipment",
      validationIssues: [],
    };

    const validated = validateExtractedExpense(rawData, "receipt.pdf");
    assert.strictEqual(validated.validationStatus, "needs_review");

    const mathIssue = validated.validationIssues.find(
      (i) => i.code === "ARITHMETIC_MISMATCH"
    );
    assert.ok(mathIssue);
    assert.strictEqual(mathIssue?.severity, "warning");
  });

  it("gracefully recovers from malformed or non-object Gemini responses", () => {
    const validated = validateExtractedExpense(
      "just a string from model",
      "bad_file.pdf"
    );

    assert.strictEqual(validated.validationStatus, "processing_failed");
    assert.strictEqual(validated.validationIssues[0].code, "MALFORMED_EXTRACTION_DATA");
  });

  it("validates categories and defaults unrecognized ones to uncategorized", () => {
    const valid = validateCategory("equipment");
    assert.strictEqual(valid.category, "equipment");
    assert.strictEqual(valid.issue, undefined);

    const unknown = validateCategory("luxurious_gifts");
    assert.strictEqual(unknown.category, "uncategorized");
    assert.strictEqual(unknown.issue?.code, "UNCATEGORIZED_EXPENSE");
  });
});
