import { describe, it } from "node:test";
import assert from "node:assert";
import { dispatchToN8nWorkflow } from "../../src/lib/services/workflow-client.ts";

describe("n8n Workflow Client Error Handling", () => {
  it("returns a descriptive 503 error when n8n is offline or unreachable", async () => {
    // Set unreachable port
    process.env.N8N_WEBHOOK_URL = "http://127.0.0.1:59999/webhook/impact-circles-ai-automation";
    process.env.N8N_WEBHOOK_SECRET = "test_secret_12345";

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest dummy invoice");

    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 503);
      assert.match(result.error, /Unable to connect to local n8n instance/);
    }
  });

  it("fails with 500 error if N8N_WEBHOOK_SECRET is missing", async () => {
    const originalSecret = process.env.N8N_WEBHOOK_SECRET;
    delete process.env.N8N_WEBHOOK_SECRET;

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest dummy invoice");

    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    // Restore secret
    process.env.N8N_WEBHOOK_SECRET = originalSecret;

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 500);
      assert.match(result.error, /N8N_WEBHOOK_SECRET is not set/);
    }
  });
});
