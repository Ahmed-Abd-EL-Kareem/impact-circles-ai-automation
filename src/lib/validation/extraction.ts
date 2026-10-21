import type {
  ExpenseCategory,
  ExtractedExpenseData,
  ValidationIssue,
  ValidationStatus,
  ValidatedExpenseResult,
} from "../types/expense.ts";

export const ALLOWED_CATEGORIES: Set<ExpenseCategory> = new Set([
  "personnel",
  "travel",
  "equipment",
  "software",
  "events",
  "operational",
  "uncategorized",
]);

// Standard 3-letter currency regex + common symbols map
const ISO_CURRENCY_REGEX = /^[A-Z]{3}$/;
const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  "$": "USD",
  "US$": "USD",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
  "EGP": "EGP",
  "LE": "EGP",
  "AED": "AED",
  "SAR": "SAR",
  "CAD": "CAD",
  "AUD": "AUD",
  "CHF": "CHF",
};

/**
 * Normalizes and validates currency code without converting currency value.
 */
export function normalizeCurrency(raw: unknown): {
  currency: string | null;
  issue?: ValidationIssue;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      currency: null,
      issue: {
        code: "MISSING_CURRENCY",
        message: "Currency code could not be determined from the document.",
        severity: "error",
        field: "currency",
      },
    };
  }

  const trimmed = raw.trim().toUpperCase();
  if (ISO_CURRENCY_REGEX.test(trimmed)) {
    return { currency: trimmed };
  }

  const mapped = CURRENCY_SYMBOL_MAP[raw.trim()] || CURRENCY_SYMBOL_MAP[trimmed];
  if (mapped) {
    return { currency: mapped };
  }

  return {
    currency: trimmed.slice(0, 10),
    issue: {
      code: "NON_STANDARD_CURRENCY",
      message: `Currency "${raw}" is not a recognized 3-letter ISO code.`,
      severity: "warning",
      field: "currency",
    },
  };
}

/**
 * Validates and normalizes date (YYYY-MM-DD). Null if missing or invalid.
 */
export function validateExpenseDate(raw: unknown): {
  date: Date | null;
  dateString: string | null;
  issue?: ValidationIssue;
} {
  if (typeof raw !== "string" || !raw.trim()) {
    return {
      date: null,
      dateString: null,
      issue: {
        code: "MISSING_DATE",
        message: "Invoice/receipt date was not found in the document.",
        severity: "warning",
        field: "expenseDate",
      },
    };
  }

  const trimmed = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return {
      date: null,
      dateString: null,
      issue: {
        code: "INVALID_DATE_FORMAT",
        message: `Date "${trimmed}" does not follow YYYY-MM-DD format.`,
        severity: "warning",
        field: "expenseDate",
      },
    };
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  if (
    dateObj.getUTCFullYear() !== year ||
    dateObj.getUTCMonth() !== month - 1 ||
    dateObj.getUTCDate() !== day
  ) {
    return {
      date: null,
      dateString: null,
      issue: {
        code: "INVALID_CALENDAR_DATE",
        message: `Date "${trimmed}" is not a valid calendar date.`,
        severity: "warning",
        field: "expenseDate",
      },
    };
  }

  // Sanity check: prevent dates far in the future (> 1 year from now) or before 1990
  const currentYear = new Date().getFullYear();
  if (year > currentYear + 1 || year < 1990) {
    return {
      date: dateObj,
      dateString: trimmed,
      issue: {
        code: "SUSPICIOUS_DATE",
        message: `Date "${trimmed}" is unusually far in the past or future.`,
        severity: "warning",
        field: "expenseDate",
      },
    };
  }

  return { date: dateObj, dateString: trimmed };
}

/**
 * Validates decimal amount strings without floating point arithmetic errors.
 * Rejects malformed numbers and enforces positive totals.
 */
export function validateDecimalAmount(
  raw: unknown,
  fieldName: "amount" | "taxAmount" | "subtotalAmount"
): {
  amountStr: string | null;
  numericVal: number | null;
  issue?: ValidationIssue;
} {
  if (raw === null || raw === undefined || raw === "") {
    return {
      amountStr: null,
      numericVal: null,
      issue:
        fieldName === "amount"
          ? {
              code: "MISSING_AMOUNT",
              message: "Total amount was not found in the document.",
              severity: "error",
              field: "amount",
            }
          : undefined,
    };
  }

  let cleaned = String(raw).trim();
  cleaned = cleaned.replace(/^["']|["']$/g, "").trim();

  // Strip leading currency signs if directly prepended
  cleaned = cleaned.replace(/^(\$|€|£|¥|US\$|LE|EGP|AED|SAR)\s*/i, "").trim();

  // If formatted with thousands comma separators, remove them only if validly structured
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  }

  // Strictly check that cleaned string is a pure decimal number
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return {
      amountStr: null,
      numericVal: null,
      issue: {
        code: `INVALID_${fieldName.toUpperCase()}`,
        message: `Field "${fieldName}" value "${raw}" is not a valid decimal number.`,
        severity: "error",
        field: fieldName,
      },
    };
  }

  const parsed = Number(cleaned);

  if (isNaN(parsed)) {
    return {
      amountStr: null,
      numericVal: null,
      issue: {
        code: `INVALID_${fieldName.toUpperCase()}`,
        message: `Field "${fieldName}" value "${raw}" is not a valid number.`,
        severity: "error",
        field: fieldName,
      },
    };
  }

  // Total amounts must be strictly positive (> 0)
  if (fieldName === "amount") {
    if (parsed <= 0) {
      return {
        amountStr: parsed.toFixed(2),
        numericVal: parsed,
        issue: {
          code: parsed === 0 ? "ZERO_AMOUNT" : "NEGATIVE_AMOUNT",
          message: `Total amount must be strictly positive (got ${parsed.toFixed(2)}).`,
          severity: "error",
          field: "amount",
        },
      };
    }
  } else {
    // taxAmount and subtotalAmount cannot be negative
    if (parsed < 0) {
      return {
        amountStr: parsed.toFixed(2),
        numericVal: parsed,
        issue: {
          code: `NEGATIVE_${fieldName.toUpperCase()}`,
          message: `Field "${fieldName}" cannot be negative (${parsed.toFixed(2)}).`,
          severity: "error",
          field: fieldName,
        },
      };
    }
  }

  if (parsed > 100_000_000) {
    return {
      amountStr: parsed.toFixed(2),
      numericVal: parsed,
      issue: {
        code: `UNREASONABLE_${fieldName.toUpperCase()}`,
        message: `Field "${fieldName}" (${cleaned}) exceeds reasonable maximum bounds.`,
        severity: "warning",
        field: fieldName,
      },
    };
  }

  return {
    amountStr: parsed.toFixed(2),
    numericVal: parsed,
  };
}

/**
 * Validates category against approved enumeration.
 * Falls back to "uncategorized" with a review warning on invalid or missing values.
 */
export function validateCategory(raw: unknown): {
  category: ExpenseCategory;
  issue?: ValidationIssue;
} {
  if (typeof raw === "string" && raw.trim()) {
    const normalized = raw.trim().toLowerCase() as ExpenseCategory;
    if (ALLOWED_CATEGORIES.has(normalized)) {
      return { category: normalized };
    }
  }

  return {
    category: "uncategorized",
    issue: {
      code: "UNCATEGORIZED_EXPENSE",
      message: raw
        ? `Category "${String(raw)}" unrecognized; defaulted to uncategorized.`
        : "Category not provided; defaulted to uncategorized.",
      severity: "warning",
      field: "category",
    },
  };
}

/**
 * Full server-side validation of raw extracted Gemini response.
 * Enforces contract integrity, bounds, sanity arithmetic, and assigns status.
 */
export function validateExtractedExpense(
  raw: unknown,
  sourceFileName: string,
  idempotencyKey?: string | null
): ValidatedExpenseResult {
  const issues: ValidationIssue[] = [];

  if (!raw || typeof raw !== "object") {
    return {
      idempotencyKey: idempotencyKey || null,
      expenseDate: null,
      vendor: null,
      invoiceNumber: null,
      description: null,
      subtotalAmount: null,
      amount: null,
      currency: null,
      taxAmount: null,
      category: "uncategorized",
      validationStatus: "processing_failed",
      validationIssues: [
        {
          code: "MALFORMED_EXTRACTION_DATA",
          message: "Gemini returned non-object extraction data.",
          severity: "error",
        },
      ],
      sourceFileName,
    };
  }

  const data = raw as Partial<ExtractedExpenseData>;

  // 1. Vendor
  let vendor: string | null = null;
  if (typeof data.vendor === "string" && data.vendor.trim()) {
    vendor = data.vendor.trim().slice(0, 255);
  } else {
    issues.push({
      code: "MISSING_VENDOR",
      message: "Vendor name could not be extracted from document.",
      severity: "warning",
      field: "vendor",
    });
  }

  // 2. Invoice Number
  let invoiceNumber: string | null = null;
  if (typeof data.invoiceNumber === "string" && data.invoiceNumber.trim()) {
    invoiceNumber = data.invoiceNumber.trim().slice(0, 100);
  } else {
    issues.push({
      code: "MISSING_INVOICE_NUMBER",
      message: "Invoice / receipt number is not present.",
      severity: "warning",
      field: "invoiceNumber",
    });
  }

  // 3. Description
  let description: string | null = null;
  if (typeof data.description === "string" && data.description.trim()) {
    description = data.description.trim().slice(0, 1000);
  }

  // 4. Date
  const dateResult = validateExpenseDate(data.expenseDate);
  if (dateResult.issue) issues.push(dateResult.issue);

  // 5. Amount
  const amountResult = validateDecimalAmount(data.amount, "amount");
  if (amountResult.issue) issues.push(amountResult.issue);

  // 6. Currency
  const currencyResult = normalizeCurrency(data.currency);
  if (currencyResult.issue) issues.push(currencyResult.issue);

  // 7. Tax Amount
  const taxResult = validateDecimalAmount(data.taxAmount, "taxAmount");
  if (taxResult.issue) issues.push(taxResult.issue);

  // 8. Subtotal Amount
  const subResult = validateDecimalAmount(data.subtotalAmount, "subtotalAmount");
  if (subResult.issue) issues.push(subResult.issue);

  // 9. Category
  const catResult = validateCategory(data.category);
  if (catResult.issue) issues.push(catResult.issue);

  // 10. Cross-field arithmetic sanity checks
  if (amountResult.numericVal !== null && taxResult.numericVal !== null) {
    if (taxResult.numericVal > amountResult.numericVal) {
      issues.push({
        code: "TAX_EXCEEDS_TOTAL",
        message: `Tax amount (${taxResult.amountStr}) exceeds total amount (${amountResult.amountStr}).`,
        severity: "error",
        field: "taxAmount",
      });
    }

    // When subtotal, tax, and total are all available: verify subtotal + tax == total within 0.02 tolerance
    if (subResult.numericVal !== null) {
      const calculatedTotal = subResult.numericVal + taxResult.numericVal;
      const diff = Math.abs(calculatedTotal - amountResult.numericVal);
      if (diff > 0.02) {
        issues.push({
          code: "ARITHMETIC_MISMATCH",
          message: `Subtotal (${subResult.amountStr}) + Tax (${taxResult.amountStr}) = ${calculatedTotal.toFixed(
            2
          )}, which does not match Total (${amountResult.amountStr}) within 0.02 tolerance.`,
          severity: "warning",
          field: "amount",
        });
      }
    }
  }

  // 11. Pass through model-identified issues
  if (Array.isArray(data.validationIssues)) {
    for (const modelIssue of data.validationIssues) {
      if (
        modelIssue &&
        typeof modelIssue === "object" &&
        typeof modelIssue.message === "string"
      ) {
        issues.push({
          code: modelIssue.code || "DOCUMENT_AMBIGUITY",
          message: modelIssue.message,
          severity: modelIssue.severity === "error" ? "error" : "warning",
          field: modelIssue.field,
        });
      }
    }
  }

  // 12. Determine validation status
  // An expense is valid ONLY if all primary fields exist, there are zero errors, zero warnings, and core fields are positive & normalized.
  const hasErrors = issues.some((i) => i.severity === "error");
  const missingCoreFields =
    !vendor || !amountResult.amountStr || !currencyResult.currency;

  let validationStatus: ValidationStatus = "valid";
  if (hasErrors || missingCoreFields || issues.length > 0) {
    validationStatus = "needs_review";
  }

  return {
    idempotencyKey: idempotencyKey || null,
    expenseDate: dateResult.date,
    vendor,
    invoiceNumber,
    description,
    subtotalAmount: subResult.amountStr,
    amount: amountResult.amountStr,
    currency: currencyResult.currency,
    taxAmount: taxResult.amountStr,
    category: catResult.category,
    validationStatus,
    validationIssues: issues,
    sourceFileName,
  };
}
