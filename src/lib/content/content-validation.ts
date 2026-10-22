import type { GeneratedContentPackage } from "../types/content.ts";

function isNonEmptyString(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((item) => typeof item === "string" && item.trim().length > 0);
}

export type ValidationResult =
  | { isValid: true; data: GeneratedContentPackage }
  | { isValid: false; error: string };

/**
 * Validates that an untrusted object strictly conforms to GeneratedContentPackage:
 * - Top-level: title, summary
 * - LinkedIn: postText, hashtags (string array), characterCount (accurate number)
 * - Newsletter: subject, previewText, bodyText, callToAction
 * - Website: title, subtitle, slug, bodyMarkdown, tags (string array)
 *
 * Rejects empty or malformed structures with clear, actionable error messages.
 */
export function validateGeneratedContentPackage(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      isValid: false,
      error: "Malformed content package: payload must be a non-null JSON object.",
    };
  }

  const obj = raw as Record<string, unknown>;

  // Top level
  if (!isNonEmptyString(obj.title)) {
    return { isValid: false, error: "Validation error: 'title' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(obj.summary)) {
    return { isValid: false, error: "Validation error: 'summary' is required and must be a non-empty string." };
  }

  // LinkedIn
  if (!obj.linkedin || typeof obj.linkedin !== "object" || Array.isArray(obj.linkedin)) {
    return { isValid: false, error: "Validation error: 'linkedin' format object is required." };
  }
  const li = obj.linkedin as Record<string, unknown>;
  if (!isNonEmptyString(li.postText)) {
    return { isValid: false, error: "Validation error: 'linkedin.postText' is required and must be a non-empty string." };
  }
  if (!isStringArray(li.hashtags)) {
    return { isValid: false, error: "Validation error: 'linkedin.hashtags' must be an array of non-empty strings." };
  }

  // Ensure character count accurately matches postText length
  const accurateCharCount = li.postText.length;

  // Newsletter
  if (!obj.newsletter || typeof obj.newsletter !== "object" || Array.isArray(obj.newsletter)) {
    return { isValid: false, error: "Validation error: 'newsletter' format object is required." };
  }
  const nl = obj.newsletter as Record<string, unknown>;
  if (!isNonEmptyString(nl.subject)) {
    return { isValid: false, error: "Validation error: 'newsletter.subject' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(nl.previewText)) {
    return { isValid: false, error: "Validation error: 'newsletter.previewText' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(nl.bodyText)) {
    return { isValid: false, error: "Validation error: 'newsletter.bodyText' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(nl.callToAction)) {
    return { isValid: false, error: "Validation error: 'newsletter.callToAction' is required and must be a non-empty string." };
  }

  // Website
  if (!obj.website || typeof obj.website !== "object" || Array.isArray(obj.website)) {
    return { isValid: false, error: "Validation error: 'website' format object is required." };
  }
  const ws = obj.website as Record<string, unknown>;
  if (!isNonEmptyString(ws.title)) {
    return { isValid: false, error: "Validation error: 'website.title' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(ws.subtitle)) {
    return { isValid: false, error: "Validation error: 'website.subtitle' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(ws.slug)) {
    return { isValid: false, error: "Validation error: 'website.slug' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(ws.bodyMarkdown)) {
    return { isValid: false, error: "Validation error: 'website.bodyMarkdown' is required and must be a non-empty string." };
  }
  if (!isStringArray(ws.tags)) {
    return { isValid: false, error: "Validation error: 'website.tags' must be an array of non-empty strings." };
  }

  const validatedPackage: GeneratedContentPackage = {
    title: obj.title.trim(),
    summary: obj.summary.trim(),
    linkedin: {
      postText: li.postText,
      hashtags: (li.hashtags as string[]).map((h) => h.trim()),
      characterCount: accurateCharCount,
    },
    newsletter: {
      subject: nl.subject.trim(),
      previewText: nl.previewText.trim(),
      bodyText: nl.bodyText.trim(),
      callToAction: nl.callToAction.trim(),
    },
    website: {
      title: ws.title.trim(),
      subtitle: ws.subtitle.trim(),
      slug: ws.slug.trim(),
      bodyMarkdown: ws.bodyMarkdown.trim(),
      tags: (ws.tags as string[]).map((t) => t.trim()),
    },
  };

  return {
    isValid: true,
    data: validatedPackage,
  };
}
