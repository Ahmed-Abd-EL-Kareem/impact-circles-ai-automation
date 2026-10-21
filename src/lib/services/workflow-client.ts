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
  const timeoutMs = 45000; // 45s timeout for multimodal AI pipeline
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
