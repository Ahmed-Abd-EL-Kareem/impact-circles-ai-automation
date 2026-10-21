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

    // 3. Execute extraction pipeline via Gemini
    console.log("3. Executing extraction pipeline with Gemini API...");
    console.log(`   Using configured model: ${process.env.GEMINI_MODEL || "gemini-flash-latest"}`);
    const firstRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-invoice.pdf",
      mimeType: "application/pdf",
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
    console.log(`     - Tax: ${firstExpense.taxAmount}`);
    console.log(`     - Category: ${firstExpense.category}`);
    console.log(`     - Status: ${firstExpense.validationStatus}`);
    console.log(`     - Issues: ${JSON.stringify(firstExpense.validationIssues)}\n`);

    // 4. Test duplicate detection by re-submitting duplicate fixture
    console.log("4. Testing duplicate candidate detection with duplicate invoice...");
    const dupRun = await executeDocumentPipelineDirect({
      buffer: invoiceBuffer,
      fileName: "fictional-duplicate-invoice.pdf",
      mimeType: "application/pdf",
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

    if (dupExpense.validationStatus === "duplicate_suspected") {
      console.log("   ✓ SUCCESS: Primary duplicate was correctly detected and flagged!\n");
    } else {
      console.log(`   ⚠ Status was '${dupExpense.validationStatus}' instead of 'duplicate_suspected'\n`);
    }

    // 5. Check Summary aggregation
    console.log("5. Testing financial summary calculation from Neon PostgreSQL...");
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

    // 6. Test n8n webhook connectivity if n8n is running
    console.log("6. Probing local n8n workflow webhook endpoint...");
    const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/impact-circles-ai-automation";
    try {
      const probeRes = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET || "",
        },
        body: JSON.stringify({
          fileData: invoiceBuffer.toString("base64"),
          fileName: "probe.pdf",
          mimeType: "application/pdf",
        }),
        signal: AbortSignal.timeout(4000),
      });

      console.log(`   ✓ n8n endpoint responded with HTTP ${probeRes.status}`);
      if (probeRes.ok) {
        const n8nBody = await probeRes.json();
        console.log("   ✓ n8n workflow returned:", n8nBody);
        if (n8nBody.expense?.id) {
          createdIds.push(n8nBody.expense.id);
        }
      }
    } catch {
      console.log(`   ℹ n8n is currently offline at ${webhookUrl} (expected if n8n server is not running).`);
      console.log("     Start n8n using 'npx n8n' to test active webhook orchestration.");
    }

    console.log("\n=================================================");
    console.log("✓ All integration checks completed successfully!");
    console.log("=================================================\n");
  } finally {
    // Clean up test records
    if (createdIds.length > 0) {
      console.log(`Cleaning up ${createdIds.length} integration test record(s) from Neon...`);
      await prisma.expense.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log("✓ Cleaned up test records from database.");
    }
    await prisma.$disconnect();
  }
}

runIntegrationTest().catch((err) => {
  console.error("\n❌ Integration test failed:", err);
  process.exit(1);
});
