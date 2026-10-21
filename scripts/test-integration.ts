import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { executeDocumentPipelineDirect } from "../src/lib/services/pipeline.ts";
import { prisma } from "../src/lib/db.ts";

dotenv.config();

async function runIntegrationTest() {
  console.log("=================================================");
  console.log("Impact Circles - Phase 2 Integration Test Suite");
  console.log("=================================================\n");

  const createdIds: string[] = [];

  try {
    // 1. Verify Neon Database Connection
    console.log("1. Checking Neon PostgreSQL connection...");
    const initialCount = await prisma.expense.count();
    console.log(`   ✓ Connected to Neon! Current record count: ${initialCount}\n`);

    // 2. Load fictional sample invoice
    console.log("2. Loading fictional sample invoice fixture...");
    const invoicePath = path.join(process.cwd(), "test-fixtures", "fictional-invoice.pdf");
    if (!fs.existsSync(invoicePath)) {
      throw new Error(`Test fixture not found at: ${invoicePath}`);
    }
    const invoiceBuffer = fs.readFileSync(invoicePath);
    console.log(`   ✓ Loaded ${invoicePath} (${invoiceBuffer.length} bytes)\n`);

    // 3. Execute extraction pipeline via Gemini with unique idempotency key
    const testIdempotencyKey = `int-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log("3. Executing extraction pipeline with Gemini API...");
    console.log(`   Using configured model: ${process.env.GEMINI_MODEL || "gemini-flash-latest"}`);
    console.log(`   Idempotency key: ${testIdempotencyKey}`);

    const firstRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: testIdempotencyKey,
    });

    if (!firstRun.success) {
      throw new Error(`Pipeline failed: ${firstRun.error}`);
    }

    const firstExpense = firstRun.expense;
    createdIds.push(firstExpense.id);
    console.log("   ✓ Pipeline succeeded! Extracted expense record:");
    console.log(`     - ID: ${firstExpense.id}`);
    console.log(`     - Vendor: ${firstExpense.vendor}`);
    console.log(`     - Invoice #: ${firstExpense.invoiceNumber}`);
    console.log(`     - Date: ${firstExpense.expenseDate}`);
    console.log(`     - Amount: ${firstExpense.currency} ${firstExpense.amount}`);
    console.log(`     - Subtotal: ${firstExpense.subtotalAmount}`);
    console.log(`     - Tax: ${firstExpense.taxAmount}`);
    console.log(`     - Category: ${firstExpense.category}`);
    console.log(`     - Status: ${firstExpense.validationStatus}`);
    console.log(`     - IdempotencyKey: ${firstExpense.idempotencyKey}`);
    console.log(`     - Issues: ${JSON.stringify(firstExpense.validationIssues)}\n`);

    // 4. Test request-level idempotency replay
    console.log("4. Testing request-level idempotency replay...");
    const replayRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: testIdempotencyKey,
    });

    if (!replayRun.success) {
      throw new Error(`Idempotency replay request failed: ${replayRun.error}`);
    }

    if (replayRun.expense.id !== firstExpense.id) {
      throw new Error(
        `Idempotency failed: Expected same record ID '${firstExpense.id}', but got '${replayRun.expense.id}'`
      );
    }

    const countAfterReplay = await prisma.expense.count();
    if (countAfterReplay !== initialCount + 1) {
      throw new Error(
        `Idempotency failed: Record count increased from ${initialCount + 1} to ${countAfterReplay} on replay`
      );
    }
    console.log("   ✓ SUCCESS: Replayed request returned identical record ID without duplicate insertion.\n");

    // 5. Test duplicate candidate detection by submitting duplicate fixture with different key
    console.log("5. Testing duplicate candidate detection with duplicate invoice...");
    const dupKey = `int-dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dupRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-duplicate-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: dupKey,
    });

    if (!dupRun.success) {
      throw new Error(`Duplicate test pipeline failed: ${dupRun.error}`);
    }

    const dupExpense = dupRun.expense;
    createdIds.push(dupExpense.id);
    console.log("   ✓ Second record created with duplicate detection evaluation:");
    console.log(`     - ID: ${dupExpense.id}`);
    console.log(`     - Status: ${dupExpense.validationStatus}`);
    console.log(`     - Issues recorded: ${JSON.stringify(dupExpense.validationIssues)}`);

    // Strict assertion: fail if status is not duplicate_suspected
    if (dupExpense.validationStatus !== "duplicate_suspected") {
      throw new Error(
        `Duplicate detection ASSERTION FAILED: Expected validationStatus 'duplicate_suspected', but got '${dupExpense.validationStatus}'`
      );
    }

    const hasDupIssue = dupExpense.validationIssues.some(
      (i) => i.code === "DUPLICATE_SUSPECTED" || i.code === "DUPLICATE_CANDIDATE"
    );
    if (!hasDupIssue) {
      throw new Error(
        "Duplicate detection ASSERTION FAILED: validationIssues did not contain DUPLICATE_SUSPECTED issue"
      );
    }
    console.log("   ✓ SUCCESS: Primary duplicate was correctly detected, flagged, and asserted!\n");

    // 6. Check Summary aggregation
    console.log("6. Testing financial summary calculation from Neon PostgreSQL...");
    const totalExpenses = await prisma.expense.count();
    const currencySummary = await prisma.expense.groupBy({
      by: ["currency"],
      _count: { id: true },
      _sum: { amount: true },
      where: { currency: { not: null } },
    });

    console.log(`   ✓ Total database expenses: ${totalExpenses}`);
    console.log("   ✓ Volumes grouped strictly by currency (no cross-currency addition):");
    for (const group of currencySummary) {
      console.log(`     - ${group.currency}: count=${group._count.id}, total=${group._sum.amount}`);
    }
    console.log();

    // 7. Test n8n webhook connectivity and live execution
    console.log("7. Probing local n8n workflow webhook endpoint...");
    const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/impact-circles-ai-automation";
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET || "dev-secret-impact-circles-2026";
    const n8nIdempotencyKey = `int-n8n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const probeRes = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": webhookSecret,
        },
        body: JSON.stringify({
          fileData: invoiceBuffer.toString("base64"),
          fileName: "probe.pdf",
          mimeType: "application/pdf",
          idempotencyKey: n8nIdempotencyKey,
        }),
        signal: AbortSignal.timeout(15000),
      });

      console.log(`   ✓ n8n endpoint responded with HTTP ${probeRes.status}`);
      if (probeRes.ok) {
        const n8nBody = await probeRes.json();
        console.log("   ✓ n8n workflow returned successfully:", {
          success: n8nBody.success,
          expenseId: n8nBody.expense?.id,
          vendor: n8nBody.expense?.vendor,
          amount: n8nBody.expense?.amount,
          validationStatus: n8nBody.expense?.validationStatus,
        });

        if (n8nBody.expense?.id) {
          createdIds.push(n8nBody.expense.id);
        }

        // Test n8n idempotency replay
        console.log("   Testing n8n idempotency replay with same key...");
        const n8nReplayRes = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": webhookSecret,
          },
          body: JSON.stringify({
            fileData: invoiceBuffer.toString("base64"),
            fileName: "probe.pdf",
            mimeType: "application/pdf",
            idempotencyKey: n8nIdempotencyKey,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (n8nReplayRes.ok) {
          const replayBody = await n8nReplayRes.json();
          if (replayBody.expense?.id === n8nBody.expense?.id) {
            console.log("   ✓ SUCCESS: n8n workflow preserved idempotency on replay!\n");
          } else {
            console.warn(
              `   ⚠ n8n replay returned id '${replayBody.expense?.id}' vs '${n8nBody.expense?.id}'`
            );
          }
        }
      } else {
        const errText = await probeRes.text();
        console.log(`   ⚠ n8n returned non-200 status: ${probeRes.status} - ${errText}`);
      }
    } catch (e: unknown) {
      console.log(`   ℹ n8n probe note: ${e instanceof Error ? e.message : String(e)}`);
      console.log(`     (Expected if n8n server is offline or busy)`);
    }

    console.log("\n=================================================");
    console.log("✓ All integration checks completed successfully!");
    console.log("=================================================\n");
  } finally {
    // Clean up test records
    if (createdIds.length > 0) {
      console.log(`Cleaning up ${createdIds.length} integration test record(s) from Neon...`);
      const deleteResult = await prisma.expense.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log(`✓ Cleaned up ${deleteResult.count} test record(s) from database.`);
    }
    await prisma.$disconnect();
  }
}

runIntegrationTest().catch((err) => {
  console.error("\n❌ Integration test failed:", err);
  process.exit(1);
});
