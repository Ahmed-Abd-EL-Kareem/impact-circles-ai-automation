-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "expenseDate" TIMESTAMP(3),
    "vendor" TEXT,
    "invoiceNumber" TEXT,
    "description" TEXT,
    "amount" DECIMAL(12,2),
    "currency" TEXT,
    "taxAmount" DECIMAL(12,2),
    "category" TEXT NOT NULL DEFAULT 'uncategorized',
    "validationStatus" TEXT NOT NULL DEFAULT 'needs_review',
    "validationIssues" JSONB NOT NULL DEFAULT '[]',
    "sourceFileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_vendor_invoiceNumber_idx" ON "Expense"("vendor", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Expense_validationStatus_idx" ON "Expense"("validationStatus");

-- CreateIndex
CREATE INDEX "Expense_createdAt_idx" ON "Expense"("createdAt");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
