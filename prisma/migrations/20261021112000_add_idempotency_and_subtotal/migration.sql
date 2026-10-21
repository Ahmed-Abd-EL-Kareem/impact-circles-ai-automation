-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "subtotalAmount" DECIMAL(12,2);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_idempotencyKey_key" ON "Expense"("idempotencyKey");
