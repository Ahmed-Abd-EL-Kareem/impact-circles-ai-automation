import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Pure validation predicate matching the exact logic in n8n's
 * 'Validate Request & Secret' node.
 */
interface WebhookAuthPayload {
  headers?: Record<string, string>;
  body?: {
    fileData?: unknown;
    fileName?: unknown;
    mimeType?: unknown;
    idempotencyKey?: unknown;
  };
}

interface ValidationResult {
  isValid: boolean;
  statusCode?: number;
  error?: string;
  fileData?: string;
  fileName?: string;
  mimeType?: string;
  idempotencyKey?: string | null;
}

function evaluateWebhookRequest(
  payload: WebhookAuthPayload,
  envSecret: string | undefined
): ValidationResult {
  const headers = payload.headers || {};
  const secretHeader = headers["x-webhook-secret"] || headers["X-Webhook-Secret"];
  const expectedSecret = (envSecret || "").trim();

  // 1. Fail closed if secret is not configured on server
  if (!expectedSecret) {
    return {
      isValid: false,
      statusCode: 500,
      error: "Server configuration error: N8N_WEBHOOK_SECRET is not configured on server.",
    };
  }

  // 2. Reject missing or mismatched secret
  if (!secretHeader || secretHeader !== expectedSecret) {
    return {
      isValid: false,
      statusCode: 401,
      error: "Unauthorized: Invalid or missing webhook shared secret.",
    };
  }

  // 3. Reject missing or malformed payload fields
  const body = payload.body || {};
  const allowedMimes = ["application/pdf", "image/png", "image/jpeg"];

  if (
    !body.fileData ||
    typeof body.fileData !== "string" ||
    !body.fileName ||
    typeof body.fileName !== "string" ||
    !body.mimeType ||
    typeof body.mimeType !== "string" ||
    !allowedMimes.includes(body.mimeType)
  ) {
    return {
      isValid: false,
      statusCode: 400,
      error: "Bad Request: Missing or unsupported document payload fields (fileData, fileName, mimeType).",
    };
  }

  // 4. Reject payload exceeding 10MB decoded limit
  const base64Len = body.fileData.length;
  const estimatedDecodedBytes = Math.ceil(base64Len * 0.75);
  if (estimatedDecodedBytes > 10 * 1024 * 1024) {
    return {
      isValid: false,
      statusCode: 400,
      error: "Bad Request: File size exceeds the maximum limit of 10 MB.",
    };
  }

  // 5. Validate idempotency key format if supplied
  let idempotencyKey: string | null = null;
  if (body.idempotencyKey) {
    const rawKey = String(body.idempotencyKey).trim();
    if (rawKey.length > 255 || !/^[a-zA-Z0-9_\-.:]+$/.test(rawKey)) {
      return {
        isValid: false,
        statusCode: 400,
        error: "Bad Request: Invalid idempotency key format or length exceeds 255 characters.",
      };
    }
    idempotencyKey = rawKey;
  }

  return {
    isValid: true,
    fileData: body.fileData,
    fileName: body.fileName,
    mimeType: body.mimeType,
    idempotencyKey,
  };
}

describe("Webhook Authentication & Payload Guardrails (Fail-Closed)", () => {
  const validSecret = "super-secret-key-2026";
  const validPayload: WebhookAuthPayload = {
    headers: { "x-webhook-secret": validSecret },
    body: {
      fileData: "JVBERi0xLjQKJcTl8uXr...",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      idempotencyKey: "req_test_123",
    },
  };

  it("authenticates successfully with correct secret and valid payload", () => {
    const result = evaluateWebhookRequest(validPayload, validSecret);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.fileName, "invoice.pdf");
    assert.strictEqual(result.idempotencyKey, "req_test_123");
  });

  it("fails closed with 500 when server secret is missing or undefined", () => {
    const result = evaluateWebhookRequest(validPayload, undefined);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 500);
    assert.match(result.error!, /N8N_WEBHOOK_SECRET is not configured/);
  });

  it("fails closed with 500 when server secret is empty string or whitespace", () => {
    const result = evaluateWebhookRequest(validPayload, "   ");
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 500);
    assert.match(result.error!, /N8N_WEBHOOK_SECRET is not configured/);
  });

  it("rejects request with 401 when x-webhook-secret header is missing", () => {
    const noHeaderPayload: WebhookAuthPayload = {
      headers: {},
      body: validPayload.body,
    };
    const result = evaluateWebhookRequest(noHeaderPayload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 401);
    assert.match(result.error!, /Unauthorized/);
  });

  it("rejects request with 401 when x-webhook-secret header is incorrect", () => {
    const badSecretPayload: WebhookAuthPayload = {
      headers: { "x-webhook-secret": "wrong-secret-token" },
      body: validPayload.body,
    };
    const result = evaluateWebhookRequest(badSecretPayload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 401);
    assert.match(result.error!, /Unauthorized/);
  });

  it("accepts header in uppercase format X-Webhook-Secret", () => {
    const upperHeaderPayload: WebhookAuthPayload = {
      headers: { "X-Webhook-Secret": validSecret },
      body: validPayload.body,
    };
    const result = evaluateWebhookRequest(upperHeaderPayload, validSecret);
    assert.strictEqual(result.isValid, true);
  });

  it("rejects request with 400 when fileData is missing", () => {
    const payload: WebhookAuthPayload = {
      headers: { "x-webhook-secret": validSecret },
      body: {
        fileName: "invoice.pdf",
        mimeType: "application/pdf",
      },
    };
    const result = evaluateWebhookRequest(payload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error!, /Missing or unsupported document payload fields/);
  });

  it("rejects request with 400 when mimeType is unsupported (e.g. text/html, application/zip)", () => {
    const payload: WebhookAuthPayload = {
      headers: { "x-webhook-secret": validSecret },
      body: {
        fileData: "base64data",
        fileName: "malicious.exe",
        mimeType: "application/x-msdownload",
      },
    };
    const result = evaluateWebhookRequest(payload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error!, /Missing or unsupported document payload fields/);
  });

  it("rejects request with 400 when fileData exceeds 10MB decoded size bound", () => {
    // 14MB base64 string -> ~10.5MB decoded
    const oversizedBase64 = "A".repeat(14 * 1024 * 1024);
    const payload: WebhookAuthPayload = {
      headers: { "x-webhook-secret": validSecret },
      body: {
        fileData: oversizedBase64,
        fileName: "huge.pdf",
        mimeType: "application/pdf",
      },
    };
    const result = evaluateWebhookRequest(payload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error!, /File size exceeds the maximum limit of 10 MB/);
  });

  it("rejects request with 400 when idempotency key exceeds 255 characters", () => {
    const longKey = "k".repeat(256);
    const payload: WebhookAuthPayload = {
      headers: { "x-webhook-secret": validSecret },
      body: {
        fileData: "base64data",
        fileName: "test.pdf",
        mimeType: "application/pdf",
        idempotencyKey: longKey,
      },
    };
    const result = evaluateWebhookRequest(payload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error!, /Invalid idempotency key format or length/);
  });

  it("rejects request with 400 when idempotency key contains illegal characters", () => {
    const payload: WebhookAuthPayload = {
      headers: { "x-webhook-secret": validSecret },
      body: {
        fileData: "base64data",
        fileName: "test.pdf",
        mimeType: "application/pdf",
        idempotencyKey: "key with spaces; DROP TABLE Expense;--",
      },
    };
    const result = evaluateWebhookRequest(payload, validSecret);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.statusCode, 400);
    assert.match(result.error!, /Invalid idempotency key format or length/);
  });
});
