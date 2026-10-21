import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { prisma } from "../src/lib/db.ts";

dotenv.config();

/**
 * True Production n8n End-to-End Test Suite
 *
 * Requirements:
 * - n8n must be running on port 5678 with workflow active.
 * - If n8n or credentials are unavailable, this test exits non-zero (NO FALSE SUCCESS).
 * - Tests full path: Webhook -> Auth -> Early Idempotency -> Gemini -> Neon Postgres -> Response.
 * - Asserts fail-closed auth, payload validation, atomic idempotency replay, and duplicate detection.
 * - Cleans up only test-created records in finally block.
 */
async function runProductionN8nE2ETest() {
  console.log("=========================================================");
  console.log("Impact Circles - Production n8n End-to-End Test");
  console.log("=========================================================\n");

  const baseUrl = process.env.N8N_BASE_URL || "http://localhost:5678";
  const webhookUrl =
    process.env.N8N_WEBHOOK_URL ||
    `${baseUrl}/webhook/impact-circles-ai-automation`;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ BLOCKED: N8N_WEBHOOK_SECRET is not configured in .env.");
    process.exit(1);
  }
  const verifiedWebhookSecret: string = webhookSecret;
  if (!process.env.DATABASE_URL) {
    console.error("❌ BLOCKED: DATABASE_URL is not configured in .env.");
    process.exit(1);
  }

  const createdIds: string[] = [];

  try {
    // 1. Check prerequisites
    console.log("1. Checking service prerequisites...");
    let n8nHealthy = false;
    const probeUrls = [baseUrl, "http://127.0.0.1:5678"];

    for (const probeUrl of probeUrls) {
      try {
        const healthRes = await fetch(`${probeUrl}/healthz`, {
          signal: AbortSignal.timeout(8000),
        });
        if (healthRes.ok) {
          n8nHealthy = true;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!n8nHealthy) {
      console.error(
        `❌ BLOCKED: n8n server is unreachable on ${baseUrl}. Start n8n before running this test.`
      );
      process.exit(1);
    }
    console.log("   ✓ n8n server is online and healthy.\n");

    // 2. Load test fixture
    console.log("2. Loading test invoice fixture...");
    const invoicePath = path.join(
      process.cwd(),
      "test-fixtures",
      "fictional-invoice.pdf"
    );
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
    console.log("4. Testing malformed payload rejection (unsupported mimeType)...");
    const badPayloadRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        fileData: "some-data",
        fileName: "bad.exe",
        mimeType: "application/x-msdownload",
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

    // Helper to gracefully retry on transient upstream AI bursts (429 / 503 / 502)
    async function postWebhookWithRetry(
      payload: Record<string, unknown>,
      stepName: string,
      maxAttempts = 5
    ): Promise<Response> {
      let attempt = 0;
      while (attempt < maxAttempts) {
        attempt++;
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": verifiedWebhookSecret,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(90000),
        });

        if (res.status === 201) {
          return res;
        }

        if ((res.status === 429 || res.status === 502 || res.status === 503) && attempt < maxAttempts) {
          const waitTime = attempt * 5000;
          console.log(`   [${stepName}] Got HTTP ${res.status}. Waiting ${waitTime}ms for upstream AI quota/burst to settle (attempt ${attempt}/${maxAttempts})...`);
          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        return res;
      }
      throw new Error(`Exceeded max retry attempts for ${stepName}`);
    }

    // 5. Test Live Ingestion & Persistence via n8n
    const testIdempotencyKey = `e2e-n8n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    console.log("5. Testing valid document ingestion through n8n workflow...");
    console.log(`   Idempotency key: ${testIdempotencyKey}`);

    const initialDbCount = await prisma.expense.count();

    const successRes = await postWebhookWithRetry({
      fileData: base64Data,
      fileName: "fictional-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: testIdempotencyKey,
    }, "Step 5 Document Ingestion");

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

    // 6. Test Early Request-Level Idempotency Replay through n8n
    console.log("6. Testing n8n request idempotency replay with same key (early fast path)...");
    const replayStartTime = Date.now();
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
    const replayDurationMs = Date.now() - replayStartTime;

    if (replayRes.status !== 200 && replayRes.status !== 201) {
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
    console.log(`   ✓ SUCCESS: Replay returned identical record in ${replayDurationMs}ms without duplicate insertion!\n`);

    // 7. Test Altered Payload Replay (Tampering Immunity)
    console.log("7. Testing replay with altered payload (tampering immunity)...");
    const alteredRes = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        fileData: base64Data,
        fileName: "altered-tampered-name.pdf",
        mimeType: "application/pdf",
        idempotencyKey: testIdempotencyKey, // same key
      }),
      signal: AbortSignal.timeout(45000),
    });

    const alteredBody = await alteredRes.json();
    if (alteredBody.expense.id !== firstExpense.id) {
      throw new Error(`Tampering replay returned different ID: ${alteredBody.expense.id}`);
    }
    // Verify in database that original values were NOT overwritten
    const checkDbRecord = await prisma.expense.findUnique({
      where: { id: firstExpense.id },
    });
    if (checkDbRecord?.sourceFileName !== "fictional-invoice.pdf") {
      throw new Error(`Database record was mutated on altered replay: ${checkDbRecord?.sourceFileName}`);
    }
    console.log("   ✓ SUCCESS: Altered replay preserved original record without overwriting!\n");

    // 8. Test Business Duplicate Candidate Detection through n8n
    console.log("8. Testing business duplicate detection (different key, duplicate invoice)...");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const dupKey = `e2e-dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const dupRes = await postWebhookWithRetry({
      fileData: base64Data,
      fileName: "fictional-duplicate-invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: dupKey,
    }, "Step 8 Business Duplicate");

    if (dupRes.status !== 201) {
      const errText = await dupRes.text();
      throw new Error(`Duplicate submission failed with HTTP ${dupRes.status}: ${errText}`);
    }

    const dupBody = await dupRes.json();
    const dupExpense = dupBody.expense;
    createdIds.push(dupExpense.id);

    if (dupExpense.id === firstExpense.id) {
      throw new Error(`ASSERTION FAILED: New request with distinct key must create distinct record.`);
    }

    if (dupExpense.validationStatus !== "duplicate_suspected") {
      throw new Error(
        `ASSERTION FAILED: Expected validationStatus='duplicate_suspected', got '${dupExpense.validationStatus}'`
      );
    }

    const issues = typeof dupExpense.validationIssues === "string"
      ? JSON.parse(dupExpense.validationIssues)
      : dupExpense.validationIssues || [];
    const hasDupIssue = issues.some(
      (i: { code: string }) => i.code === "DUPLICATE_CANDIDATE"
    );
    if (!hasDupIssue) {
      throw new Error(`ASSERTION FAILED: Missing DUPLICATE_CANDIDATE issue in validationIssues.`);
    }
    console.log("   ✓ SUCCESS: Business duplicate correctly detected and flagged duplicate_suspected!\n");

    // 9. Verify Multi-Currency Summary in Neon PostgreSQL
    console.log("9. Verifying multi-currency summary in Neon PostgreSQL...");
    const summary = await prisma.expense.groupBy({
      by: ["currency"],
      _count: { id: true },
      _sum: { amount: true },
      where: {
        currency: { not: null },
        amount: { gt: 0 },
        validationStatus: { not: "failed" },
      },
    });

    for (const group of summary) {
      console.log(`     - ${group.currency}: count=${group._count.id}, total=${group._sum.amount}`);
    }

    console.log("\n=========================================================");
    console.log("✓ All production n8n end-to-end checks PASSED!");
    console.log("=========================================================\n");
  } finally {
    if (createdIds.length > 0) {
      console.log(`Cleaning up ${createdIds.length} E2E test record(s) from Neon PostgreSQL...`);
      await prisma.expense.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log(`✓ Cleaned up ${createdIds.length} test record(s).`);
    }
    await prisma.$disconnect();
  }
}

runProductionN8nE2ETest().catch((err) => {
  console.error("❌ Production n8n E2E test failed:", err);
  process.exit(1);
});
