import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { executeDocumentPipelineDirect } from "../src/lib/services/pipeline.ts";
import { prisma } from "../src/lib/db.ts";

dotenv.config();

/**
 * Direct TypeScript Pipeline Integration Test
 * NOTE: This tests the local TypeScript pipeline only (not n8n).
 * For true production flow verification, run scripts/test-n8n-e2e.ts.
 */
async function runDirectPipelineTest() {
  console.log("=========================================================");
  console.log("Impact Circles - Direct Pipeline Integration Test");
  console.log("=========================================================\n");

  if (!process.env.DATABASE_URL) {
    console.error("❌ BLOCKED: DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ BLOCKED: GEMINI_API_KEY is not set.");
    process.exit(1);
  }

  const createdIds: string[] = [];

  try {
    console.log("1. Connecting to Neon PostgreSQL...");
    const initialCount = await prisma.expense.count();
    console.log(`   ✓ Connected to Neon! Current record count: ${initialCount}\n`);

    console.log("2. Loading test invoice fixture...");
    const invoicePath = path.join(process.cwd(), "test-fixtures", "fictional-invoice.pdf");
    if (!fs.existsSync(invoicePath)) {
      throw new Error(`Test fixture not found at: ${invoicePath}`);
    }
    const invoiceBuffer = fs.readFileSync(invoicePath);
    console.log(`   ✓ Loaded ${invoicePath} (${invoiceBuffer.length} bytes)\n`);

    // 3. First execution
    const testKey = `direct-idem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log(`3. Executing direct pipeline with Gemini (${process.env.GEMINI_MODEL || "gemini-flash-latest"})...`);
    console.log(`   Idempotency key: ${testKey}`);

    const firstRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: testKey,
    });

    if (!firstRun.success) {
      throw new Error(`Direct pipeline failed: ${firstRun.error}`);
    }

    createdIds.push(firstRun.expense.id);
    console.log("   ✓ Direct pipeline persisted record:");
    console.log(`     - ID: ${firstRun.expense.id}`);
    console.log(`     - Vendor: ${firstRun.expense.vendor}`);
    console.log(`     - Amount: ${firstRun.expense.currency} ${firstRun.expense.amount}`);
    console.log(`     - Status: ${firstRun.expense.validationStatus}\n`);

    // 4. Test idempotency replay
    console.log("4. Testing direct pipeline request idempotency replay...");
    const replayRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: testKey,
    });

    if (!replayRun.success) {
      throw new Error(`Idempotency replay failed: ${replayRun.error}`);
    }

    if (replayRun.expense.id !== firstRun.expense.id) {
      throw new Error(`Idempotency failed: expected ${firstRun.expense.id}, got ${replayRun.expense.id}`);
    }

    const countAfterReplay = await prisma.expense.count();
    if (countAfterReplay !== initialCount + 1) {
      throw new Error(`Idempotency count check failed: count changed on replay.`);
    }
    console.log("   ✓ SUCCESS: Replayed request returned identical record ID without inserting duplicate.\n");

    // 5. Test duplicate candidate detection
    console.log("5. Testing duplicate candidate detection with different key...");
    const dupKey = `direct-dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dupRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-duplicate-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: dupKey,
    });

    if (!dupRun.success) {
      throw new Error(`Duplicate pipeline test failed: ${dupRun.error}`);
    }

    createdIds.push(dupRun.expense.id);
    if (dupRun.expense.validationStatus !== "duplicate_suspected") {
      throw new Error(
        `ASSERTION FAILED: Expected duplicate_suspected, got ${dupRun.expense.validationStatus}`
      );
    }
    console.log("   ✓ SUCCESS: Duplicate correctly flagged as duplicate_suspected!\n");

    // 6. Test currency grouping
    console.log("6. Verifying currency grouping in Neon PostgreSQL...");
    const currencySummary = await prisma.expense.groupBy({
      by: ["currency"],
      _count: { id: true },
      _sum: { amount: true },
      where: { currency: { not: null } },
    });
    for (const group of currencySummary) {
      console.log(`     - ${group.currency}: count=${group._count.id}, total=${group._sum.amount}`);
    }

    console.log("\n=========================================================");
    console.log("✓ Direct pipeline integration tests completed successfully!");
    console.log("=========================================================\n");
  } finally {
    if (createdIds.length > 0) {
      console.log(`Cleaning up ${createdIds.length} test record(s) from Neon...`);
      await prisma.expense.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log("✓ Cleanup complete.");
    }
    await prisma.$disconnect();
  }
}

runDirectPipelineTest().catch((err) => {
  console.error("❌ Direct pipeline test failed:", err);
  process.exit(1);
});
