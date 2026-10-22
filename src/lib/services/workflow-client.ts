import type { ExpenseRecord, ValidationIssue } from "../types/expense.ts";

export interface ProcessDocumentParams {
  buffer: Buffer;
  fileName: string;
  mimeType: "application/pdf" | "image/png" | "image/jpeg";
  idempotencyKey?: string;
}

export type ProcessDocumentResult =
  | { success: true; expense: ExpenseRecord }
  | { success: false; error: string; statusCode?: number };

/**
 * Dispatches the validated document to the n8n orchestration workflow.
 * The n8n workflow executes extraction, duplicate detection, and persistence.
 * Next.js does NOT independently insert records into the database to guarantee
 * single persistence ownership.
 */
export async function dispatchToN8nWorkflow(
  params: ProcessDocumentParams
): Promise<ProcessDocumentResult> {
  const webhookUrl =
    process.env.N8N_WEBHOOK_URL ||
    "http://localhost:5678/webhook/impact-circles-ai-automation";

  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return {
      success: false,
      error:
        "Server configuration error: N8N_WEBHOOK_SECRET is not set in environment variables.",
      statusCode: 500,
    };
  }

  const base64Data = params.buffer.toString("base64");

  const payload = {
    fileData: base64Data,
    fileName: params.fileName,
    mimeType: params.mimeType,
    idempotencyKey:
      params.idempotencyKey ||
      `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  const controller = new AbortController();
  const timeoutMs = 90000; // 90s timeout coordinated with n8n workflow execution bounds
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();

    if (!response.ok) {
      let parsedError = responseText;
      try {
        const jsonErr = JSON.parse(responseText);
        parsedError = jsonErr.error || jsonErr.message || responseText;
      } catch {
        parsedError = responseText.slice(0, 300);
      }

      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: "Authentication failed: n8n webhook rejected the shared secret.",
          statusCode: 401,
        };
      }

      return {
        success: false,
        error: `n8n workflow failed with status ${response.status}: ${parsedError || "Unknown error"}`,
        statusCode: response.status >= 500 ? 502 : response.status,
      };
    }

    if (!responseText || !responseText.trim()) {
      return {
        success: false,
        error: "n8n workflow returned an empty response. No expense record was persisted.",
        statusCode: 502,
      };
    }

    let data: {
      success?: boolean;
      error?: string;
      expense?: Record<string, unknown>;
    };
    try {
      data = JSON.parse(responseText);
    } catch {
      return {
        success: false,
        error: `n8n workflow returned invalid non-JSON output: ${responseText.slice(0, 200)}`,
        statusCode: 502,
      };
    }

    if (!data || !data.success || !data.expense || !data.expense.id) {
      return {
        success: false,
        error:
          data?.error ||
          "n8n workflow did not return a valid persisted expense record.",
        statusCode: 502,
      };
    }

    // Format fields
    const expense = data.expense;
    let issues: ValidationIssue[] = [];
    if (Array.isArray(expense.validationIssues)) {
      issues = expense.validationIssues as ValidationIssue[];
    } else if (typeof expense.validationIssues === "string") {
      try {
        issues = JSON.parse(expense.validationIssues);
      } catch {
        issues = [];
      }
    }

    return {
      success: true,
      expense: {
        id: String(expense.id),
        idempotencyKey: expense.idempotencyKey ? String(expense.idempotencyKey) : null,
        expenseDate: expense.expenseDate
          ? new Date(expense.expenseDate as string).toISOString().slice(0, 10)
          : null,
        vendor: expense.vendor ? String(expense.vendor) : null,
        invoiceNumber: expense.invoiceNumber ? String(expense.invoiceNumber) : null,
        description: expense.description ? String(expense.description) : null,
        subtotalAmount:
          expense.subtotalAmount !== null && expense.subtotalAmount !== undefined
            ? String(expense.subtotalAmount)
            : null,
        amount:
          expense.amount !== null && expense.amount !== undefined
            ? String(expense.amount)
            : null,
        currency: expense.currency ? String(expense.currency) : null,
        taxAmount:
          expense.taxAmount !== null && expense.taxAmount !== undefined
            ? String(expense.taxAmount)
            : null,
        category: (expense.category as ExpenseRecord["category"]) || "uncategorized",
        validationStatus: (expense.validationStatus as ExpenseRecord["validationStatus"]) || "needs_review",
        validationIssues: issues,
        sourceFileName: expense.sourceFileName ? String(expense.sourceFileName) : params.fileName,
        createdAt: expense.createdAt
          ? new Date(expense.createdAt as string).toISOString()
          : new Date().toISOString(),
        updatedAt: expense.updatedAt
          ? new Date(expense.updatedAt as string).toISOString()
          : new Date().toISOString(),
      },
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error:
          "n8n workflow timed out after 45 seconds. The workflow or external AI service took too long to respond.",
        statusCode: 504,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("ENOTFOUND")
    ) {
      return {
        success: false,
        error: `Unable to connect to local n8n instance at ${webhookUrl}. Please ensure n8n is running ('npx n8n') and the finance workflow is active.`,
        statusCode: 503,
      };
    }

    return {
      success: false,
      error: `Workflow execution error: ${message}`,
      statusCode: 502,
    };
  }
}

export interface ContentGenerationWebhookParams {
  action: "generate";
  sourcePrompt: string;
  contentType: string;
  additionalInstructions?: string;
  targetChannels?: string[];
}

export interface ContentPublishingWebhookParams {
  action: "publish";
  postId: string;
  channels?: string[];
}

export type ContentWebhookParams =
  | ContentGenerationWebhookParams
  | ContentPublishingWebhookParams;

export type ContentWorkflowResult =
  | { success: true; post?: unknown; results?: unknown; data?: unknown }
  | { success: false; error: string; statusCode?: number };

/**
 * Dispatches content generation or publishing to the n8n content publishing workflow.
 * Supports both test webhooks (/webhook-test/...) and active webhooks (/webhook/...).
 */
export async function dispatchContentToN8nWorkflow(
  params: ContentWebhookParams
): Promise<ContentWorkflowResult> {
  let webhookUrl =
    process.env.N8N_CONTENT_WEBHOOK_URL ||
    `${process.env.N8N_BASE_URL || "http://localhost:5678"}/webhook/impact-circles-content-publishing`;

  const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return {
      success: false,
      error: "Server configuration error: N8N_WEBHOOK_SECRET is not set in environment variables.",
      statusCode: 500,
    };
  }

  const callWebhook = async (url: string) => {
    const controller = new AbortController();
    const timeoutMs = 90000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": webhookSecret,
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseText = await response.text();
      return { ok: response.ok, status: response.status, text: responseText };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    let callResult = await callWebhook(webhookUrl);

    // If test webhook was specified but n8n was not actively waiting on test event (404),
    // automatically try the active production webhook fallback
    if (!callResult.ok && callResult.status === 404 && webhookUrl.includes("webhook-test")) {
      const fallbackUrl = webhookUrl.replace("/webhook-test/", "/webhook/");
      try {
        const fallbackResult = await callWebhook(fallbackUrl);
        if (fallbackResult.ok || fallbackResult.status !== 404) {
          callResult = fallbackResult;
          webhookUrl = fallbackUrl;
        }
      } catch {
        // keep initial result
      }
    }

    if (!callResult.ok) {
      let parsedError = callResult.text;
      try {
        const jsonErr = JSON.parse(callResult.text);
        parsedError = jsonErr.error || jsonErr.message || callResult.text;
      } catch {
        parsedError = callResult.text.slice(0, 300);
      }

      if (callResult.status === 401 || callResult.status === 403) {
        return {
          success: false,
          error: "Authentication failed: n8n webhook rejected the shared secret.",
          statusCode: 401,
        };
      }

      if (callResult.status === 404 && webhookUrl.includes("webhook-test")) {
        return {
          success: false,
          error:
            "n8n test webhook is not currently listening. In the n8n canvas editor, click 'Test step' or 'Execute workflow' on the Webhook node, then submit again.",
          statusCode: 404,
        };
      }

      return {
        success: false,
        error: `n8n workflow failed with status ${callResult.status}: ${parsedError || "Unknown error"}`,
        statusCode: callResult.status >= 500 ? 502 : callResult.status,
      };
    }

    if (!callResult.text || !callResult.text.trim()) {
      return {
        success: false,
        error: "n8n workflow returned an empty response.",
        statusCode: 502,
      };
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(callResult.text) as Record<string, unknown>;
    } catch {
      return {
        success: false,
        error: `n8n workflow returned invalid non-JSON output: ${callResult.text.slice(0, 200)}`,
        statusCode: 502,
      };
    }

    if (!data || !data.success) {
      return {
        success: false,
        error: data?.error || "n8n content workflow returned an unsuccessful response.",
        statusCode: 502,
      };
    }

    return {
      success: true,
      post: data.post,
      results: data.logs,
      data,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        error: "n8n content workflow timed out after 90 seconds.",
        statusCode: 504,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("ENOTFOUND")
    ) {
      return {
        success: false,
        error: `Unable to connect to local n8n instance at ${webhookUrl}. Please ensure n8n is running.`,
        statusCode: 503,
      };
    }

    return {
      success: false,
      error: `Workflow execution error: ${message}`,
      statusCode: 502,
    };
  }
}
