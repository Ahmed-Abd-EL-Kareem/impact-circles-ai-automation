import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Pure evaluation function matching the updated 'Validate Request & Secret' node
 * in n8n/workflows/content-publishing.json
 */
interface ContentWebhookPayload {
  headers?: Record<string, string>;
  body?: {
    action?: unknown;
    sourcePrompt?: unknown;
    contentType?: unknown;
    additionalInstructions?: unknown;
    targetChannels?: unknown;
    postId?: unknown;
    channels?: unknown;
  };
}

interface WebhookValidationResult {
  isValid: boolean;
  statusCode?: number;
  error?: string;
  action?: "generate" | "publish";
  sourcePrompt?: string;
  contentType?: string;
  additionalInstructions?: string;
  targetChannels?: string[];
  postId?: string;
  channels?: string[] | null;
}

export function evaluateContentWebhookRequest(
  payload: ContentWebhookPayload,
  envSecret: string | undefined
): WebhookValidationResult {
  const headers = payload.headers || {};
  const secretHeader = headers["x-webhook-secret"] || headers["X-Webhook-Secret"];
  const expectedSecret = (envSecret || "").trim();

  if (!expectedSecret) {
    return {
      isValid: false,
      statusCode: 500,
      error: "Server configuration error: N8N_WEBHOOK_SECRET is not configured on server.",
    };
  }

  if (!secretHeader || secretHeader !== expectedSecret) {
    return {
      isValid: false,
      statusCode: 401,
      error: "Unauthorized: Invalid or missing webhook shared secret.",
    };
  }

  const body = payload.body || {};
  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "generate";

  if (!["generate", "publish"].includes(action)) {
    return {
      isValid: false,
      statusCode: 400,
      error: 'Bad Request: action must be either "generate" or "publish".',
    };
  }

  if (action === "generate") {
    const sourcePrompt = typeof body.sourcePrompt === "string" ? body.sourcePrompt.trim() : "";
    if (!sourcePrompt || sourcePrompt.length < 10) {
      return {
        isValid: false,
        statusCode: 400,
        error: "Bad Request: sourcePrompt must be at least 10 characters describing the research or announcement.",
      };
    }

    const allowedTypes = ["research_update", "event_announcement", "project_findings"];
    const contentType = typeof body.contentType === "string" ? body.contentType.trim() : "research_update";
    if (!allowedTypes.includes(contentType)) {
      return {
        isValid: false,
        statusCode: 400,
        error: "Bad Request: contentType must be one of: research_update, event_announcement, project_findings.",
      };
    }

    const targetChannels = Array.isArray(body.targetChannels) && body.targetChannels.length > 0
      ? (body.targetChannels as string[])
      : ["website", "linkedin", "newsletter"];

    return {
      isValid: true,
      action: "generate",
      sourcePrompt,
      contentType,
      additionalInstructions: typeof body.additionalInstructions === "string" ? body.additionalInstructions : "",
      targetChannels,
    };
  }

  // action === 'publish'
  const postId = typeof body.postId === "string" ? body.postId.trim() : "";
  if (!postId) {
    return {
      isValid: false,
      statusCode: 400,
      error: "Bad Request: postId is required for publish action.",
    };
  }

  const channels = Array.isArray(body.channels) && body.channels.length > 0
    ? (body.channels as string[])
    : null;

  return {
    isValid: true,
    action: "publish",
    postId,
    channels,
  };
}

/**
 * Pure validation predicate matching the updated 'Validate & Sanitize Generated Content'
 * node in n8n/workflows/content-publishing.json
 */
export function validateN8nGeneratedContent(rawText: string) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  let data: Record<string, any>;
  try {
    data = JSON.parse(cleaned.trim());
  } catch {
    return {
      isValid: false,
      statusCode: 400,
      error: "Validation error: Failed to parse Gemini output as JSON.",
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      isValid: false,
      statusCode: 400,
      error: "Validation error: Output must be a non-null JSON object.",
    };
  }

  function isNonEmptyString(val: unknown): val is string {
    return typeof val === "string" && val.trim().length > 0;
  }
  function isStringArray(val: unknown): val is string[] {
    return Array.isArray(val) && val.length > 0 && val.every((item) => typeof item === "string" && item.trim().length > 0);
  }

  // 1. Top-level validation
  if (!isNonEmptyString(data.title)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'title' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(data.summary)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'summary' is required and must be a non-empty string." };
  }

  // 2. LinkedIn validation
  if (!data.linkedin || typeof data.linkedin !== "object" || Array.isArray(data.linkedin)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'linkedin' format object is required." };
  }
  const linkedinText = isNonEmptyString(data.linkedin.postText)
    ? data.linkedin.postText.trim()
    : isNonEmptyString(data.linkedin.content)
    ? data.linkedin.content.trim()
    : "";
  if (!linkedinText) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'linkedin.postText' is required and must be a non-empty string." };
  }
  if (!isStringArray(data.linkedin.hashtags)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'linkedin.hashtags' must be an array of non-empty strings." };
  }
  const linkedin = {
    postText: linkedinText,
    content: linkedinText,
    hashtags: data.linkedin.hashtags.map((h: string) => h.trim()),
    characterCount: linkedinText.length,
  };

  // 3. Newsletter validation
  if (!data.newsletter || typeof data.newsletter !== "object" || Array.isArray(data.newsletter)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'newsletter' format object is required." };
  }
  if (!isNonEmptyString(data.newsletter.subject)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'newsletter.subject' is required and must be a non-empty string." };
  }
  const preview = isNonEmptyString(data.newsletter.previewText)
    ? data.newsletter.previewText.trim()
    : isNonEmptyString(data.newsletter.preview)
    ? data.newsletter.preview.trim()
    : "";
  if (!preview) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'newsletter.previewText' is required and must be a non-empty string." };
  }
  const bodyText = isNonEmptyString(data.newsletter.bodyText)
    ? data.newsletter.bodyText.trim()
    : isNonEmptyString(data.newsletter.body)
    ? data.newsletter.body.trim()
    : "";
  if (!bodyText) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'newsletter.bodyText' is required and must be a non-empty string." };
  }
  const cta = isNonEmptyString(data.newsletter.callToAction)
    ? data.newsletter.callToAction.trim()
    : isNonEmptyString(data.newsletter.cta)
    ? data.newsletter.cta.trim()
    : "";
  if (!cta) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'newsletter.callToAction' is required and must be a non-empty string." };
  }
  const newsletter = {
    subject: data.newsletter.subject.trim(),
    previewText: preview,
    preview: preview,
    bodyText: bodyText,
    body: bodyText,
    callToAction: cta,
    cta: cta,
  };

  // 4. Website validation
  if (!data.website || typeof data.website !== "object" || Array.isArray(data.website)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website' format object is required." };
  }
  if (!isNonEmptyString(data.website.title)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website.title' is required and must be a non-empty string." };
  }
  const subtitle = isNonEmptyString(data.website.subtitle)
    ? data.website.subtitle.trim()
    : isNonEmptyString(data.website.excerpt)
    ? data.website.excerpt.trim()
    : "";
  if (!subtitle) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website.subtitle' is required and must be a non-empty string." };
  }
  if (!isNonEmptyString(data.website.slug)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website.slug' is required and must be a non-empty string." };
  }
  const normalizedSlug = data.website.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!normalizedSlug) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website.slug' contains no valid alphanumeric characters." };
  }
  const markdown = isNonEmptyString(data.website.bodyMarkdown)
    ? data.website.bodyMarkdown.trim()
    : isNonEmptyString(data.website.markdownContent)
    ? data.website.markdownContent.trim()
    : isNonEmptyString(data.website.markdown)
    ? data.website.markdown.trim()
    : "";
  if (!markdown) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website.bodyMarkdown' is required and must be a non-empty string." };
  }
  if (!isStringArray(data.website.tags)) {
    return { isValid: false, statusCode: 422, error: "Validation error: 'website.tags' must be an array of non-empty strings." };
  }
  const website = {
    title: data.website.title.trim(),
    subtitle: subtitle,
    excerpt: subtitle,
    slug: normalizedSlug,
    bodyMarkdown: markdown,
    markdownContent: markdown,
    tags: data.website.tags.map((t: string) => t.trim()),
  };

  return {
    isValid: true,
    data: {
      title: data.title.trim(),
      summary: data.summary.trim(),
      linkedin,
      newsletter,
      website,
    },
  };
}

describe("Content Workflow Webhook & Validation Logic (Fail-Closed)", () => {
  const validSecret = "secure-n8n-token-2026";

  it("authenticates content generation request with correct secret", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": validSecret },
        body: {
          action: "generate",
          sourcePrompt: "Announcing new sustainable entrepreneurship cohort findings for Q3.",
          contentType: "research_update",
        },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.action, "generate");
  });

  it("fails closed with 500 when N8N_WEBHOOK_SECRET is not configured on server", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": validSecret },
        body: { action: "generate", sourcePrompt: "Valid prompt over 10 chars" },
      },
      undefined
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 500);
    assert.match(res.error!, /N8N_WEBHOOK_SECRET is not configured on server/);
  });

  it("fails closed with 500 when N8N_WEBHOOK_SECRET is empty string or whitespace", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": validSecret },
        body: { action: "generate", sourcePrompt: "Valid prompt over 10 chars" },
      },
      "   "
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 500);
  });

  it("rejects request with 401 when x-webhook-secret header is missing", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: {},
        body: { action: "generate", sourcePrompt: "Valid prompt over 10 chars" },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  it("rejects request with 401 when x-webhook-secret is incorrect", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": "wrong-secret-token" },
        body: { action: "generate", sourcePrompt: "Valid prompt over 10 chars" },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 401);
  });

  it("accepts uppercase X-Webhook-Secret header", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "X-Webhook-Secret": validSecret },
        body: {
          action: "publish",
          postId: "cp_test12345",
        },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.action, "publish");
    assert.strictEqual(res.postId, "cp_test12345");
  });

  it("rejects publish request with 400 when postId is missing", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": validSecret },
        body: { action: "publish" },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.error!, /postId is required/);
  });

  it("rejects generate request with 400 when sourcePrompt is shorter than 10 characters", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": validSecret },
        body: { action: "generate", sourcePrompt: "too short" },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 400);
  });

  it("rejects invalid action name with 400", () => {
    const res = evaluateContentWebhookRequest(
      {
        headers: { "x-webhook-secret": validSecret },
        body: { action: "delete_everything" as any },
      },
      validSecret
    );
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 400);
  });
});

describe("n8n Content Generation Validation Invariants", () => {
  const completeValidJson = JSON.stringify({
    title: "AI & Social Entrepreneurship Report",
    summary: "New report reveals 35% efficiency gains across community incubators.",
    linkedin: {
      postText: "Excited to share our new report on AI and Social Entrepreneurship!",
      hashtags: ["#ImpactCircles", "#AIForGood"],
    },
    newsletter: {
      subject: "Monthly Dispatch: AI in Action",
      previewText: "Key takeaways from our cohort report",
      bodyText: "In this edition, we break down how automation empowers grassroots founders.",
      callToAction: "Read the full research paper",
    },
    website: {
      title: "AI & Social Entrepreneurship Report",
      subtitle: "Comprehensive findings from our Q3 incubator cohort",
      slug: "ai-social-entrepreneurship-report",
      bodyMarkdown: "# Research Findings\n\nOur extensive field research demonstrates...",
      tags: ["Research", "AI Agents", "Impact"],
    },
  });

  it("validates a complete valid generated package without defaulting", () => {
    const res = validateN8nGeneratedContent(completeValidJson);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.data?.title, "AI & Social Entrepreneurship Report");
    assert.strictEqual(res.data?.linkedin.characterCount, res.data?.linkedin.postText.length);
  });

  it("handles code fenced JSON safely", () => {
    const res = validateN8nGeneratedContent("```json\n" + completeValidJson + "\n```");
    assert.strictEqual(res.isValid, true);
  });

  it("rejects malformed non-JSON Gemini output", () => {
    const res = validateN8nGeneratedContent("Sorry, I cannot generate this response.");
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 400);
  });

  it("rejects generated package with missing title without substituting generic fallback", () => {
    const malformed = JSON.parse(completeValidJson);
    delete malformed.title;
    const res = validateN8nGeneratedContent(JSON.stringify(malformed));
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 422);
    assert.match(res.error!, /'title' is required/);
  });

  it("rejects generated package with empty linkedin text without substituting empty string", () => {
    const malformed = JSON.parse(completeValidJson);
    malformed.linkedin.postText = "   ";
    const res = validateN8nGeneratedContent(JSON.stringify(malformed));
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 422);
    assert.match(res.error!, /'linkedin.postText' is required/);
  });

  it("rejects generated package with missing newsletter callToAction", () => {
    const malformed = JSON.parse(completeValidJson);
    delete malformed.newsletter.callToAction;
    const res = validateN8nGeneratedContent(JSON.stringify(malformed));
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 422);
    assert.match(res.error!, /'newsletter.callToAction' is required/);
  });

  it("rejects generated package with missing website slug", () => {
    const malformed = JSON.parse(completeValidJson);
    delete malformed.website.slug;
    const res = validateN8nGeneratedContent(JSON.stringify(malformed));
    assert.strictEqual(res.isValid, false);
    assert.strictEqual(res.statusCode, 422);
    assert.match(res.error!, /'website.slug' is required/);
  });

  it("normalizes valid website slug to clean kebab-case", () => {
    const custom = JSON.parse(completeValidJson);
    custom.website.slug = "  AI & Sustainable Future 2026!  ";
    const res = validateN8nGeneratedContent(JSON.stringify(custom));
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.data?.website.slug, "ai-sustainable-future-2026");
  });
});

interface PostRecord {
  id: string;
  title: string;
  status: string;
  approvedAt: string | null;
  targetChannels: string[] | string;
  websiteContent?: string | null;
  linkedinContent?: string | null;
  newsletterContent?: string | null;
  existingLogs?: any[];
}

export function evaluatePublishingGuardrails(
  post: PostRecord | null,
  requestedChannels: string[] | null | undefined
) {
  if (!post || !post.id) {
    return {
      canPublish: false,
      statusCode: 404,
      error: "Not Found: Content post does not exist.",
    };
  }

  const isApproved =
    (post.status === "approved" ||
      post.status === "partially_published" ||
      post.status === "failed") &&
    post.approvedAt !== null;

  if (!isApproved) {
    return {
      canPublish: false,
      statusCode: 400,
      error: `Strict Invariant Violation: Content post cannot be published unless it has been explicitly approved by a human reviewer. Current status is "${post.status}".`,
    };
  }

  const SUPPORTED_CHANNELS = ["website", "linkedin", "newsletter"];
  let approvedChannels: string[] = [];
  if (Array.isArray(post.targetChannels)) {
    approvedChannels = post.targetChannels;
  } else if (typeof post.targetChannels === "string") {
    try {
      const parsed = JSON.parse(post.targetChannels);
      if (Array.isArray(parsed)) approvedChannels = parsed;
    } catch {
      approvedChannels = ["website", "linkedin", "newsletter"];
    }
  }

  let channelsToPublish = approvedChannels;

  if (Array.isArray(requestedChannels) && requestedChannels.length > 0) {
    for (const ch of requestedChannels) {
      if (!SUPPORTED_CHANNELS.includes(ch)) {
        return {
          canPublish: false,
          statusCode: 400,
          error: `Invalid channel '${ch}'. Supported channels are: website, linkedin, newsletter.`,
        };
      }
    }

    const sortedApproved = [...new Set(approvedChannels)].sort();
    const sortedRequested = [...new Set(requestedChannels)].sort();

    if (post.status === "approved") {
      const matches =
        sortedApproved.length === sortedRequested.length &&
        sortedApproved.every((ch, i) => ch === sortedRequested[i]);

      if (!matches) {
        return {
          canPublish: false,
          statusCode: 400,
          error: `Channel selection mismatch: Requested channels [${sortedRequested.join(", ")}] do not match the approved channel selection [${sortedApproved.join(", ")}]. Channel modifications require renewed approval before publication.`,
        };
      }
    } else {
      const unapproved = sortedRequested.find((ch) => !approvedChannels.includes(ch));
      if (unapproved) {
        return {
          canPublish: false,
          statusCode: 400,
          error: `Channel selection mismatch: Requested channel '${unapproved}' is not part of the approved channel selection.`,
        };
      }
    }

    channelsToPublish = sortedRequested;
  }

  const alreadyPublishedLogs: any[] = [];
  const existingLogs = Array.isArray(post.existingLogs) ? post.existingLogs : [];
  const alreadyPublishedChannels = new Set<string>();

  for (const log of existingLogs) {
    if (log.status === "published" || log.status === "success") {
      alreadyPublishedChannels.add(log.channel);
      alreadyPublishedLogs.push(log);
    }
  }

  const channelsToDispatch = channelsToPublish.filter((ch) => !alreadyPublishedChannels.has(ch));

  return {
    canPublish: true,
    postId: post.id,
    approvedChannels,
    channelsToPublish,
    channelsToDispatch,
    alreadyPublishedLogs,
  };
}

export function aggregatePublishingOutcomes(params: {
  postId: string;
  approvedChannels: string[];
  alreadyPublishedLogs: any[];
  dispatchedOutcomes: Array<{
    channel: string;
    statusCode: number;
    body: any;
    error?: any;
  }>;
}) {
  const { postId, approvedChannels, alreadyPublishedLogs, dispatchedOutcomes } = params;
  const successfulChannelNames = new Set<string>();
  const newLogs: any[] = [];

  for (const log of alreadyPublishedLogs) {
    if (log.status === "published" || log.status === "success") {
      successfulChannelNames.add(log.channel);
    }
  }

  for (const item of dispatchedOutcomes) {
    const channel = item.channel;
    const isSuccess = item.statusCode >= 200 && item.statusCode < 300;
    let publishedUrl: string | null = null;
    let errorMessage: string | null = null;

    if (isSuccess) {
      successfulChannelNames.add(channel);
      publishedUrl = item.body?.link || item.body?.url || item.body?.shareUrl || null;
    } else {
      const errText = item.body?.error || item.error?.message || String(item.body || "Dispatch failed");
      errorMessage = `${channel.toUpperCase()} API responded with ${item.statusCode}: ${errText}`;
    }

    const logId = `log_${channel}_${Date.now()}`;
    newLogs.push({
      id: logId,
      postId,
      channel,
      status: isSuccess ? "published" : "failed",
      publishedUrl,
      responsePayload: item.body || {},
      errorMessage,
    });
  }

  const allApprovedSuccess = approvedChannels.every((ch) => successfulChannelNames.has(ch));
  const anyApprovedSuccess = approvedChannels.some((ch) => successfulChannelNames.has(ch));

  let newStatus: "published" | "partially_published" | "failed" = "failed";
  if (allApprovedSuccess) {
    newStatus = "published";
  } else if (anyApprovedSuccess) {
    newStatus = "partially_published";
  } else {
    newStatus = "failed";
  }

  return {
    success: anyApprovedSuccess,
    newStatus,
    newLogs,
    publishedChannels: Array.from(successfulChannelNames),
  };
}

describe("n8n Content Publishing Approval & Retry Guardrails", () => {
  const approvedPost: PostRecord = {
    id: "cp_test1",
    title: "Approved Post",
    status: "approved",
    approvedAt: "2026-10-22T10:00:00Z",
    targetChannels: ["website", "linkedin", "newsletter"],
    existingLogs: [],
  };

  it("allows publishing an approved post with matching channels", () => {
    const res = evaluatePublishingGuardrails(approvedPost, ["website", "linkedin", "newsletter"]);
    assert.strictEqual(res.canPublish, true);
    assert.strictEqual(res.channelsToDispatch.length, 3);
  });

  it("rejects publishing when post status is 'draft'", () => {
    const draftPost = { ...approvedPost, status: "draft", approvedAt: null };
    const res = evaluatePublishingGuardrails(draftPost, null);
    assert.strictEqual(res.canPublish, false);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.error!, /Strict Invariant Violation/);
  });

  it("rejects publishing when post status is 'in_review'", () => {
    const inReviewPost = { ...approvedPost, status: "in_review", approvedAt: null };
    const res = evaluatePublishingGuardrails(inReviewPost, null);
    assert.strictEqual(res.canPublish, false);
    assert.strictEqual(res.statusCode, 400);
  });

  it("rejects publishing when post status is 'rejected'", () => {
    const rejectedPost = { ...approvedPost, status: "rejected", approvedAt: null };
    const res = evaluatePublishingGuardrails(rejectedPost, null);
    assert.strictEqual(res.canPublish, false);
    assert.strictEqual(res.statusCode, 400);
  });

  it("rejects publishing when approved post has channel selection mismatch", () => {
    const res = evaluatePublishingGuardrails(approvedPost, ["website", "linkedin"]);
    assert.strictEqual(res.canPublish, false);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.error!, /Channel selection mismatch/);
  });

  it("rejects publishing when requested channel is unsupported", () => {
    const res = evaluatePublishingGuardrails(approvedPost, ["website", "twitter" as any]);
    assert.strictEqual(res.canPublish, false);
    assert.strictEqual(res.statusCode, 400);
    assert.match(res.error!, /Invalid channel 'twitter'/);
  });

  it("skips previously successful channels on retry (deduplication)", () => {
    const partialPost: PostRecord = {
      id: "cp_test2",
      title: "Partially Published Post",
      status: "partially_published",
      approvedAt: "2026-10-22T10:00:00Z",
      targetChannels: ["website", "linkedin", "newsletter"],
      existingLogs: [
        { channel: "website", status: "published", publishedUrl: "http://localhost:3000/sandbox/news/p1" },
        { channel: "newsletter", status: "published", publishedUrl: "http://localhost:3000/sandbox/newsletter/c1" },
        { channel: "linkedin", status: "failed", errorMessage: "LinkedIn timeout" },
      ],
    };

    const res = evaluatePublishingGuardrails(partialPost, ["linkedin"]);
    assert.strictEqual(res.canPublish, true);
    // Only linkedin should be dispatched!
    assert.deepStrictEqual(res.channelsToDispatch, ["linkedin"]);
    assert.strictEqual(res.alreadyPublishedLogs.length, 2);
  });
});

describe("n8n Publishing Sandbox Response Aggregation & Status Transitions", () => {
  it("computes 'published' status when all channels return 2xx with URLs", () => {
    const res = aggregatePublishingOutcomes({
      postId: "cp_test1",
      approvedChannels: ["website", "linkedin", "newsletter"],
      alreadyPublishedLogs: [],
      dispatchedOutcomes: [
        { channel: "website", statusCode: 201, body: { id: "w1", link: "http://localhost:3000/sandbox/news/slug1" } },
        { channel: "linkedin", statusCode: 201, body: { id: "li1", link: "http://localhost:3000/sandbox/linkedin/li1" } },
        { channel: "newsletter", statusCode: 201, body: { id: "nl1", link: "http://localhost:3000/sandbox/newsletter/nl1" } },
      ],
    });

    assert.strictEqual(res.newStatus, "published");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.newLogs.length, 3);
    assert.strictEqual(res.newLogs[0].status, "published");
    assert.strictEqual(res.newLogs[0].publishedUrl, "http://localhost:3000/sandbox/news/slug1");
  });

  it("computes 'partially_published' status when one channel fails", () => {
    const res = aggregatePublishingOutcomes({
      postId: "cp_test1",
      approvedChannels: ["website", "linkedin", "newsletter"],
      alreadyPublishedLogs: [],
      dispatchedOutcomes: [
        { channel: "website", statusCode: 201, body: { id: "w1", link: "http://localhost:3000/sandbox/news/slug1" } },
        { channel: "linkedin", statusCode: 500, body: { error: "Simulated failure via SANDBOX_FAIL_CHANNELS" } },
        { channel: "newsletter", statusCode: 201, body: { id: "nl1", link: "http://localhost:3000/sandbox/newsletter/nl1" } },
      ],
    });

    assert.strictEqual(res.newStatus, "partially_published");
    assert.strictEqual(res.success, true);
    const failedLog = res.newLogs.find((l) => l.channel === "linkedin");
    assert.strictEqual(failedLog?.status, "failed");
    assert.strictEqual(failedLog?.publishedUrl, null);
    assert.match(failedLog?.errorMessage!, /Simulated failure via SANDBOX_FAIL_CHANNELS/);
  });

  it("computes 'failed' status when all attempted channels fail", () => {
    const res = aggregatePublishingOutcomes({
      postId: "cp_test1",
      approvedChannels: ["website", "linkedin", "newsletter"],
      alreadyPublishedLogs: [],
      dispatchedOutcomes: [
        { channel: "website", statusCode: 500, body: { error: "CMS crash" } },
        { channel: "linkedin", statusCode: 500, body: { error: "LinkedIn 500" } },
        { channel: "newsletter", statusCode: 500, body: { error: "Newsletter error" } },
      ],
    });

    assert.strictEqual(res.newStatus, "failed");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.newLogs.every((l) => l.status === "failed"), true);
  });

  it("reaches 'published' when retrying the remaining failed channel", () => {
    const alreadyPublished = [
      { channel: "website", status: "published", publishedUrl: "http://localhost:3000/sandbox/news/slug1" },
      { channel: "newsletter", status: "published", publishedUrl: "http://localhost:3000/sandbox/newsletter/nl1" },
    ];

    const res = aggregatePublishingOutcomes({
      postId: "cp_test1",
      approvedChannels: ["website", "linkedin", "newsletter"],
      alreadyPublishedLogs: alreadyPublished,
      dispatchedOutcomes: [
        { channel: "linkedin", statusCode: 201, body: { id: "li_retry", link: "http://localhost:3000/sandbox/linkedin/li_retry" } },
      ],
    });

    assert.strictEqual(res.newStatus, "published");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.newLogs.length, 1);
    assert.strictEqual(res.newLogs[0].channel, "linkedin");
    assert.strictEqual(res.newLogs[0].status, "published");
  });
});

