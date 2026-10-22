import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import {
  dispatchToN8nWorkflow,
  dispatchContentToN8nWorkflow,
} from "../../src/lib/services/workflow-client.ts";

describe("n8n Workflow Client Error Handling", () => {
  let mockServer: http.Server;
  let mockPort: number;
  let mockResponseStatus = 200;
  let mockResponseBody = "";

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const auth = req.headers["x-webhook-secret"];
      if (auth === "rejected_secret") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
      res.writeHead(mockResponseStatus, { "Content-Type": "application/json" });
      res.end(mockResponseBody);
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (addr && typeof addr === "object") {
          mockPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it("returns a descriptive 503 error when n8n is offline or unreachable", async () => {
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

    process.env.N8N_WEBHOOK_SECRET = originalSecret;

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 500);
      assert.match(result.error, /N8N_WEBHOOK_SECRET is not set/);
    }
  });

  it("handles rejected webhook authentication secret with HTTP 401", async () => {
    process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-ai-automation`;
    process.env.N8N_WEBHOOK_SECRET = "rejected_secret";

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest invoice");
    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 401);
      assert.match(result.error, /Authentication failed/);
    }
  });

  it("handles non-success HTTP status codes from n8n upstream", async () => {
    process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-ai-automation`;
    process.env.N8N_WEBHOOK_SECRET = "valid_secret";
    mockResponseStatus = 500;
    mockResponseBody = JSON.stringify({ message: "Database connection failed in workflow" });

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest invoice");
    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 502);
      assert.match(result.error, /Database connection failed in workflow/);
    }
  });

  it("handles malformed non-JSON output from n8n", async () => {
    process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-ai-automation`;
    process.env.N8N_WEBHOOK_SECRET = "valid_secret";
    mockResponseStatus = 200;
    mockResponseBody = "<html><body>502 Bad Gateway NGINX</body></html>";

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest invoice");
    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 502);
      assert.match(result.error, /invalid non-JSON output/);
    }
  });

  it("rejects success response without confirmed persisted record", async () => {
    process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-ai-automation`;
    process.env.N8N_WEBHOOK_SECRET = "valid_secret";
    mockResponseStatus = 200;
    mockResponseBody = JSON.stringify({ success: true, expense: {} }); // Missing ID

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest invoice");
    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    assert.strictEqual(result.success, false);
    if (!result.success) {
      assert.strictEqual(result.statusCode, 502);
      assert.match(result.error, /did not return a valid persisted expense record/);
    }
  });

  it("formats and returns verified persisted record on successful execution", async () => {
    process.env.N8N_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-ai-automation`;
    process.env.N8N_WEBHOOK_SECRET = "valid_secret";
    mockResponseStatus = 200;
    mockResponseBody = JSON.stringify({
      success: true,
      expense: {
        id: "exp_1001",
        vendor: "Acme Corp",
        invoiceNumber: "INV-100",
        amount: "500.00",
        currency: "USD",
        taxAmount: "50.00",
        subtotalAmount: "450.00",
        category: "software",
        validationStatus: "valid",
        validationIssues: [],
        sourceFileName: "invoice.pdf",
        createdAt: "2026-03-01T12:00:00.000Z",
        updatedAt: "2026-03-01T12:00:00.000Z",
      },
    });

    const pdfBuffer = Buffer.from("%PDF-1.4\nTest invoice");
    const result = await dispatchToN8nWorkflow({
      buffer: pdfBuffer,
      fileName: "test.pdf",
      mimeType: "application/pdf",
    });

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.expense.id, "exp_1001");
      assert.strictEqual(result.expense.vendor, "Acme Corp");
      assert.strictEqual(result.expense.amount, "500.00");
      assert.strictEqual(result.expense.subtotalAmount, "450.00");
      assert.strictEqual(result.expense.validationStatus, "valid");
    }
  });

  describe("n8n Content Workflow Client (dispatchContentToN8nWorkflow)", () => {
    it("returns descriptive 503 error when n8n instance is offline", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = "http://127.0.0.1:59999/webhook/impact-circles-content-publishing";
      process.env.N8N_WEBHOOK_SECRET = "test_secret_12345";

      const result = await dispatchContentToN8nWorkflow({
        action: "generate",
        sourcePrompt: "Valid prompt over 10 chars",
        contentType: "research_update",
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.strictEqual(result.statusCode, 503);
        assert.match(result.error, /Unable to connect to local n8n instance/);
      }
    });

    it("fails with 500 error if N8N_WEBHOOK_SECRET is missing", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-content-publishing`;
      const originalSecret = process.env.N8N_WEBHOOK_SECRET;
      delete process.env.N8N_WEBHOOK_SECRET;

      const result = await dispatchContentToN8nWorkflow({
        action: "generate",
        sourcePrompt: "Valid prompt over 10 chars",
        contentType: "research_update",
      });

      process.env.N8N_WEBHOOK_SECRET = originalSecret;
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.strictEqual(result.statusCode, 500);
        assert.match(result.error, /N8N_WEBHOOK_SECRET is not set/);
      }
    });

    it("handles rejected webhook authentication secret with HTTP 401", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-content-publishing`;
      process.env.N8N_WEBHOOK_SECRET = "rejected_secret";

      const result = await dispatchContentToN8nWorkflow({
        action: "generate",
        sourcePrompt: "Valid prompt over 10 chars",
        contentType: "research_update",
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.strictEqual(result.statusCode, 401);
        assert.match(result.error, /Authentication failed/);
      }
    });

    it("handles non-success HTTP status codes from n8n upstream", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-content-publishing`;
      process.env.N8N_WEBHOOK_SECRET = "valid_secret";
      mockResponseStatus = 400;
      mockResponseBody = JSON.stringify({
        success: false,
        error: "Strict Invariant Violation: Content post cannot be published unless approved.",
      });

      const result = await dispatchContentToN8nWorkflow({
        action: "publish",
        postId: "cp_unapproved_1",
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.strictEqual(result.statusCode, 400);
        assert.match(result.error, /Strict Invariant Violation/);
      }
    });

    it("handles malformed non-JSON output from n8n", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-content-publishing`;
      process.env.N8N_WEBHOOK_SECRET = "valid_secret";
      mockResponseStatus = 200;
      mockResponseBody = "<gateway timeout html>";

      const result = await dispatchContentToN8nWorkflow({
        action: "generate",
        sourcePrompt: "Valid prompt over 10 chars",
        contentType: "research_update",
      });

      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.strictEqual(result.statusCode, 502);
        assert.match(result.error, /invalid non-JSON output/);
      }
    });

    it("formats and returns verified post on successful generation", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-content-publishing`;
      process.env.N8N_WEBHOOK_SECRET = "valid_secret";
      mockResponseStatus = 201;
      mockResponseBody = JSON.stringify({
        success: true,
        post: {
          id: "cp_test_generated_1",
          title: "AI Automation Report",
          status: "draft",
        },
      });

      const result = await dispatchContentToN8nWorkflow({
        action: "generate",
        sourcePrompt: "Valid prompt over 10 chars",
        contentType: "research_update",
      });

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual((result.post as any)?.id, "cp_test_generated_1");
        assert.strictEqual((result.post as any)?.status, "draft");
      }
    });

    it("formats and returns verified logs on successful publishing", async () => {
      process.env.N8N_CONTENT_WEBHOOK_URL = `http://127.0.0.1:${mockPort}/webhook/impact-circles-content-publishing`;
      process.env.N8N_WEBHOOK_SECRET = "valid_secret";
      mockResponseStatus = 200;
      mockResponseBody = JSON.stringify({
        success: true,
        postId: "cp_test_published_1",
        status: "published",
        publishedChannels: ["website", "linkedin", "newsletter"],
        logs: [
          { channel: "website", status: "published", publishedUrl: "http://localhost:3000/sandbox/news/p1" },
        ],
      });

      const result = await dispatchContentToN8nWorkflow({
        action: "publish",
        postId: "cp_test_published_1",
      });

      assert.strictEqual(result.success, true);
      if (result.success) {
        assert.strictEqual(Array.isArray(result.results), true);
        assert.strictEqual((result.results as any[])[0].channel, "website");
      }
    });
  });
});
