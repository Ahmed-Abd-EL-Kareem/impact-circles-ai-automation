export type ExpenseCategory =
  | "personnel"
  | "travel"
  | "equipment"
  | "software"
  | "events"
  | "operational"
  | "uncategorized";

export type ValidationStatus =
  | "valid"
  | "needs_review"
  | "duplicate_suspected"
  | "processing_failed";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
  field?: string;
}

export interface ExtractionConfidence {
  expenseDate?: number;
  vendor?: number;
  amount?: number;
  currency?: number;
}

export interface ExtractedExpenseData {
  expenseDate: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  amount: string | null;
  currency: string | null;
  taxAmount: string | null;
  subtotalAmount?: string | null;
  category: ExpenseCategory;
  confidence?: ExtractionConfidence;
  validationIssues: ValidationIssue[];
}

export interface ValidatedExpenseResult {
  idempotencyKey?: string | null;
  expenseDate: Date | null;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  subtotalAmount: string | null;
  amount: string | null;
  currency: string | null;
  taxAmount: string | null;
  category: ExpenseCategory;
  validationStatus: ValidationStatus;
  validationIssues: ValidationIssue[];
  sourceFileName: string;
}

export interface ExpenseRecord {
  id: string;
  idempotencyKey?: string | null;
  expenseDate: string | null;
  vendor: string | null;
  invoiceNumber: string | null;
  description: string | null;
  subtotalAmount?: string | null;
  amount: string | null;
  currency: string | null;
  taxAmount: string | null;
  category: ExpenseCategory;
  validationStatus: ValidationStatus;
  validationIssues: ValidationIssue[];
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencySummary {
  currency: string;
  count: number;
  totalAmount: string;
}

export interface CategorySummary {
  category: ExpenseCategory;
  count: number;
}

export interface CategoryCurrencySummary {
  category: ExpenseCategory;
  currency: string;
  count: number;
  totalAmount: string;
}

export interface FinanceSummaryData {
  totalExpenses: number;
  needsReviewCount: number;
  validCount: number;
  duplicateSuspectedCount: number;
  byCurrency: CurrencySummary[];
  byCategory: CategorySummary[];
  byCategoryAndCurrency: CategoryCurrencySummary[];
}
