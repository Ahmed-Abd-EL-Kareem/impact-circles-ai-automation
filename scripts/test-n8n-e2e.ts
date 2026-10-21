import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { prisma } from "../src/lib/db.ts";

dotenv.config();

/**
 * True Production n8n End-to-End Test
 * Tests the complete live orchestration path:
 * Client Request -> n8n Webhook -> Fail-closed Secret Auth -> Gemini AI Extraction
 * -> Server Validation -> Neon Postgres Parameterized Queries -> Idempotency & Duplicate Assertions
 * -> Webhook Response with Persisted Record ID.
 */
async function runN8nE2ETest() {
  console.log("=========================================================");
  console.log("Impact Circles - Production n8n End-to-End Test");
  console.log("=========================================================\n");

  const webhookUrl =
    process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/impact-circles-ai-automation";
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const baseUrl = process.env.N8N_BASE_URL || "http://localhost:5678";

  // 1. Check prerequisites
  console.log("1. Checking service prerequisites...");

  if (!process.env.DATABASE_URL) {
    console.error("❌ BLOCKED: DATABASE_URL is not configured.");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ BLOCKED: GEMINI_API_KEY is not configured.");
    process.exit(1);
  }
  if (!webhookSecret) {
    console.error("❌ BLOCKED: N8N_WEBHOOK_SECRET is not configured in environment.");
    process.exit(1);
  }

  // Check n8n health
  try {
    const probeUrls = [
      `${baseUrl}/healthz`,
      baseUrl.includes("localhost") ? baseUrl.replace("localhost", "127.0.0.1") + "/healthz" : null,
    ].filter(Boolean) as string[];

    let online = false;
    for (const url of probeUrls) {
      try {
        const healthRes = await fetch(url, {
          signal: AbortSignal.timeout(8000),
        });
        if (healthRes.ok) {
          online = true;
          break;
        }
      } catch {
        // try next probe url
      }
    }

    if (!online) {
      throw new Error(`n8n health check failed on ${baseUrl}`);
    }
    console.log("   ✓ n8n server is online and healthy.\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`❌ BLOCKED: n8n server is not reachable at ${baseUrl} (${msg}).`);
    console.error("   To run this live test, start n8n with: 'npx n8n'\n");
    process.exit(1);
  }

  const createdIds: string[] = [];

  try {
    // 2. Load fixture
    console.log("2. Loading test invoice fixture...");
    const invoicePath = path.join(process.cwd(), "test-fixtures", "fictional-invoice.pdf");
    if (!fs.existsSync(invoicePath)) {
      throw new Error(`Fixture not found at: ${invoicePath}`);
    }
    const invoiceBuffer = fs.readFileSync(invoicePath);
    const base64Data = invoiceBuffer.toString("base64");
    console.log(`   ✓ Loaded ${invoicePath} (${invoiceBuffer.length} bytes)\n`);

    // 3. Test Webhook Authentication Rejection (Fail-Closed)
    console.log("3. Testing webhook authentication rejection (invalid secret)...");
    const authFailRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": "definitely-invalid-secret-key",
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: "test.pdf",
        mimeType: "application/pdf",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (authFailRes.status !== 401) {
      throw new Error(
        `ASSERTION FAILED: Expected HTTP 401 for invalid secret, got HTTP ${authFailRes.status}`
      );
    }
    const authFailBody = await authFailRes.json();
    if (authFailBody.success !== false) {
      throw new Error(`ASSERTION FAILED: Expected success=false for unauthorized request.`);
    }
    console.log("   ✓ SUCCESS: Unauthorized request was rejected with HTTP 401!\n");

    // 4. Test Malformed Payload Rejection
    console.log("4. Testing malformed payload rejection...");
    const badPayloadRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        fileData: "some-data",
        fileName: "bad.exe",
        mimeType: "application/x-msdownload", // unsupported
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (badPayloadRes.status !== 400) {
      throw new Error(
        `ASSERTION FAILED: Expected HTTP 400 for unsupported mimeType, got HTTP ${badPayloadRes.status}`
      );
    }
    const badPayloadBody = await badPayloadRes.json();
    if (badPayloadBody.success !== false) {
      throw new Error(`ASSERTION FAILED: Expected success=false for malformed payload.`);
    }
    console.log("   ✓ SUCCESS: Malformed payload was rejected with HTTP 400!\n");

    // 5. Test Live Ingestion & Persistence via n8n
    const testIdempotencyKey = `e2e-n8n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log("5. Testing valid document ingestion through n8n workflow...");
    console.log(`   Idempotency key: ${testIdempotencyKey}`);

    const initialDbCount = await prisma.expense.count();

    const successRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: "fictional-invoice.pdf",
        mimeType: "application/pdf",
        idempotencyKey: testIdempotencyKey,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (successRes.status !== 201) {
      const errText = await successRes.text();
      throw new Error(
        `ASSERTION FAILED: Expected HTTP 201, got HTTP ${successRes.status}: ${errText}`
      );
    }

    const successBody = await successRes.json();
    if (!successBody.success || !successBody.expense || !successBody.expense.id) {
      throw new Error(`ASSERTION FAILED: Workflow did not return valid persisted expense.`);
    }

    const firstExpense = successBody.expense;
    createdIds.push(firstExpense.id);
    console.log("   ✓ SUCCESS: n8n returned HTTP 201 with persisted expense:");
    console.log(`     - ID: ${firstExpense.id}`);
    console.log(`     - Vendor: ${firstExpense.vendor}`);
    console.log(`     - Invoice #: ${firstExpense.invoiceNumber}`);
    console.log(`     - Amount: ${firstExpense.currency} ${firstExpense.amount}`);
    console.log(`     - Subtotal: ${firstExpense.subtotalAmount}`);
    console.log(`     - Tax: ${firstExpense.taxAmount}`);
    console.log(`     - Status: ${firstExpense.validationStatus}\n`);

    // 6. Test Request-Level Idempotency Replay through n8n
    console.log("6. Testing n8n request idempotency replay with same key...");
    const replayRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: "fictional-invoice.pdf",
        mimeType: "application/pdf",
        idempotencyKey: testIdempotencyKey,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (replayRes.status !== 201) {
      throw new Error(`Replay request failed with HTTP ${replayRes.status}`);
    }

    const replayBody = await replayRes.json();
    if (replayBody.expense.id !== firstExpense.id) {
      throw new Error(
        `ASSERTION FAILED: Idempotency failed. Expected record ID '${firstExpense.id}', got '${replayBody.expense.id}'`
      );
    }

    const dbCountAfterReplay = await prisma.expense.count();
    if (dbCountAfterReplay !== initialDbCount + 1) {
      throw new Error(
        `ASSERTION FAILED: Database record count increased on replay from ${initialDbCount + 1} to ${dbCountAfterReplay}`
      );
    }
    console.log("   ✓ SUCCESS: Replay returned identical record without duplicate insertion!\n");

    // 7. Test Business Duplicate Candidate Detection through n8n
    console.log("7. Testing business duplicate detection (different key, duplicate invoice)...");
    const dupKey = `e2e-dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const dupRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: "fictional-duplicate-invoice.pdf",
        mimeType: "application/pdf",
        idempotencyKey: dupKey,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (dupRes.status !== 201) {
      throw new Error(`Duplicate submission failed with HTTP ${dupRes.status}`);
    }

    const dupBody = await dupRes.json();
    const dupExpense = dupBody.expense;
    createdIds.push(dupExpense.id);

    if (dupExpense.id === firstExpense.id) {
      throw new Error(`ASSERTION FAILED: New request with distinct key must create distinct record.`);
    }

    if (dupExpense.validationStatus !== "duplicate_suspected") {
      throw new Error(
        `ASSERTION FAILED: Expected validationStatus 'duplicate_suspected', got '${dupExpense.validationStatus}'`
      );
    }
    console.log("   ✓ SUCCESS: Business duplicate correctly detected and flagged duplicate_suspected!\n");

    // 8. Test Multi-Currency Financial Summary
    console.log("8. Verifying multi-currency summary in Neon PostgreSQL...");
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
    console.log("✓ All production n8n end-to-end checks PASSED!");
    console.log("=========================================================\n");
  } finally {
    if (createdIds.length > 0) {
      console.log(`Cleaning up ${createdIds.length} E2E test record(s) from Neon PostgreSQL...`);
      const deleteResult = await prisma.expense.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log(`✓ Cleaned up ${deleteResult.count} test record(s).`);
    }
    await prisma.$disconnect();
  }
}

runN8nE2ETest().catch((err) => {
  console.error("\n❌ Production n8n E2E test failed:", err);
  process.exit(1);
});
