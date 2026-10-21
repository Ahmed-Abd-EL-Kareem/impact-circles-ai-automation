import type { ExtractedExpenseData } from "../types/expense.ts";

const EXTRACTION_SYSTEM_PROMPT = `You are a financial document parser. Extract structured financial data from the provided invoice or receipt.
Return a single strictly valid JSON object matching this schema:
{
  "expenseDate": "YYYY-MM-DD or null if not found",
  "vendor": "string or null if not found",
  "invoiceNumber": "string or null if not found",
  "description": "short summary string or null if not found",
  "amount": "decimal string of grand total (e.g. '125.50') or null if not found",
  "currency": "3-letter ISO currency code (e.g. 'USD', 'EUR', 'EGP', 'GBP') or null if not found",
  "taxAmount": "decimal string of sales tax / VAT or null if not found",
  "subtotalAmount": "decimal string of pre-tax subtotal or null if not found",
  "category": "personnel | travel | equipment | software | events | operational | uncategorized",
  "confidence": {
    "expenseDate": 0.0 to 1.0,
    "vendor": 0.0 to 1.0,
    "amount": 0.0 to 1.0,
    "currency": 0.0 to 1.0
  },
  "validationIssues": [
    {
      "code": "AMBIGUOUS_AMOUNT | MULTIPLE_CURRENCIES | UNREADABLE_TEXT",
      "message": "Description of why value is ambiguous or uncertain",
      "severity": "warning | error",
      "field": "amount | currency | vendor | expenseDate"
    }
  ]
}

STRICT EXTRACTION RULES:
1. NEVER invent, fabricate, or hallucinate values not present in the document.
2. If any field is missing or unreadable, set it to null.
3. If the document has multiple possible totals or currencies, flag the ambiguity in 'validationIssues' and do not guess.
4. Do not convert currencies under any circumstances.
5. If subtotal and tax are explicitly shown, extract them into 'subtotalAmount' and 'taxAmount'.
6. Do not include markdown code blocks, backticks, or explanatory text. Return raw JSON only.`;

export async function extractWithGemini(
  fileBuffer: Buffer,
  mimeType: "application/pdf" | "image/png" | "image/jpeg"
): Promise<{ success: true; data: ExtractedExpenseData } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY is not configured on the server." };
  }

  // Use configured model or fall back to verified working model gemini-flash-latest
  let modelName = process.env.GEMINI_MODEL || "gemini-flash-latest";
  // Fix common typo in older env files
  if (modelName === "gemini-3.1-flash-light") {
    modelName = "gemini-3.1-flash-lite";
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const base64Data = fileBuffer.toString("base64");

  const requestBody = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: EXTRACTION_SYSTEM_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Gemini API returned status ${response.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const jsonResponse = await response.json();
    const rawText = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return {
        success: false,
        error: "Gemini returned an empty response. No candidates generated.",
      };
    }

    try {
      const parsedData = JSON.parse(rawText.trim()) as ExtractedExpenseData;
      return { success: true, data: parsedData };
    } catch {
      return {
        success: false,
        error: `Failed to parse Gemini response as valid JSON: ${rawText.slice(0, 100)}`,
      };
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Gemini API request timed out after 30 seconds." };
    }
    return {
      success: false,
      error: `Gemini extraction network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
