import type {
  ContentKind,
  GeneratedContentPackage,
} from "../types/content.ts";
import { validateGeneratedContentPackage } from "./content-validation.ts";

export { validateGeneratedContentPackage };

const CONTENT_GENERATION_SYSTEM_PROMPT = `You are an expert AI communications and content strategist for "Impact Circles", an organization dedicated to technology, research, sustainability, and community impact.
Your task is to transform research project updates, findings, or event announcements into three tailored communication formats.

Return a single strictly valid JSON object matching this schema:
{
  "title": "A compelling, concise title for this content package",
  "summary": "A 2-3 sentence executive briefing of the update",
  "linkedin": {
    "postText": "A professional, engaging LinkedIn post highlighting the project's significance, innovation, and key outcomes. Use professional spacing, engaging opening hook, bulleted highlights, and a call-to-action.",
    "hashtags": ["#ImpactCircles", "#Innovation", "#TechForGood", "#Research"],
    "characterCount": 850
  },
  "newsletter": {
    "subject": "Clear, engaging email subject line (under 60 chars)",
    "previewText": "Brief preheader text (under 90 chars)",
    "bodyText": "Informative update structured for organizational stakeholders and subscribers. Includes context, key milestone reached, impact metrics, and next steps.",
    "callToAction": "Clear link or action text (e.g. 'Read the full research paper' or 'Register for the briefing')"
  },
  "website": {
    "title": "Full headline for the website announcement article",
    "subtitle": "Informative dek / subheading",
    "slug": "url-friendly-kebab-case-slug",
    "bodyMarkdown": "Comprehensive article in Markdown. Includes introduction, background, findings/details, community impact, and quote or closing statement.",
    "tags": ["Research", "Announcements", "Impact"]
  }
}

STRICT GENERATION RULES:
1. ADAPT TONE TO CHANNEL:
   - LinkedIn: Professional yet conversational, thought-leadership tone, strong hook, formatted with readable line breaks.
   - Newsletter: Concise, structured, stakeholder-aligned, high signal-to-noise ratio.
   - Website: Editorial, authoritative, comprehensive Markdown format with section headers.
2. Maintain factual fidelity to the user's provided update. Do not invent contradictory claims.
3. Do not include markdown code fences (\`\`\`json) or conversational filler. Return raw valid JSON only.`;

export async function generateContentWithGemini(
  promptText: string,
  contentType: ContentKind = "research_update",
  additionalInstructions?: string
): Promise<{ success: true; data: GeneratedContentPackage } | { success: false; error: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY is not configured on the server." };
  }

  const modelName = (process.env.GEMINI_MODEL || "gemini-flash-latest").replace(/["']/g, "").trim();

  const userMessage = `CONTENT TYPE: ${contentType}
${additionalInstructions ? `ADDITIONAL INSTRUCTIONS: ${additionalInstructions}\n` : ""}
SOURCE UPDATE / FINDINGS:
${promptText.trim()}`;

  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: `${CONTENT_GENERATION_SYSTEM_PROMPT}\n\n${userMessage}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  };

  const callModel = async (model: string) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000); // 40s timeout

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("Gemini API request timed out after 40 seconds.");
      }
      throw e;
    }
  };

  try {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let response: Response | null = null;

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        response = await callModel(modelName);
      } catch (err: unknown) {
        if (attempt >= MAX_RETRIES) throw err;
        await new Promise((resolve) => setTimeout(resolve, Math.min(2000 * attempt, 8000)));
        continue;
      }

      if ((response.status === 503 || response.status === 429) && attempt < MAX_RETRIES) {
        const backoffMs = Math.min(2500 * Math.pow(1.5, attempt), 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : "No response";
      const sanitizedError = errorText.replace(new RegExp(apiKey, "g"), "[REDACTED_API_KEY]");
      return {
        success: false,
        error: `Gemini API returned status ${response?.status || 500}: ${sanitizedError.slice(0, 200)}`,
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

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText.trim());
    } catch {
      return {
        success: false,
        error: `Failed to parse Gemini response as valid JSON: ${rawText.slice(0, 100)}`,
      };
    }

    const validation = validateGeneratedContentPackage(parsedJson);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    return { success: true, data: validation.data };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: "Gemini API request timed out after 40 seconds." };
    }
    return {
      success: false,
      error: `Gemini generation network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
