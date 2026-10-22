import { prisma } from "../db.ts";
import { Prisma } from "@prisma/client";
import type { ContentPost, PublishingLog } from "@prisma/client";
import type {
  ContentKind,
  ContentPostRecord,
  ContentStatus,
  PublishChannel,
  PublishLogStatus,
  LinkedInPostContent,
  NewsletterContent,
  WebsiteAnnouncementContent,
} from "../types/content.ts";

export const SUPPORTED_CHANNELS: readonly PublishChannel[] = [
  "website",
  "linkedin",
  "newsletter",
] as const;

export interface ChannelPublishResult {
  channel: PublishChannel;
  status: PublishLogStatus;
  publishedUrl: string | null;
  errorMessage?: string;
  responsePayload?: Record<string, unknown>;
}

export interface PublishExecutionResult {
  success: boolean;
  post: ContentPostRecord;
  results: ChannelPublishResult[];
  error?: string;
}

/**
 * Publishes an approved ContentPost to its selected channels.
 * INVARIANT: Publication must never occur before explicit human approval.
 * Any edits made after approval reset status and require renewed approval.
 */
export async function publishContentPost(
  postId: string,
  options?: {
    forcedChannels?: PublishChannel[];
  }
): Promise<PublishExecutionResult> {
  const post = await prisma.contentPost.findUnique({
    where: { id: postId },
    include: { publishingLogs: true },
  });

  if (!post) {
    return {
      success: false,
      post: null as unknown as ContentPostRecord,
      results: [],
      error: `Content post '${postId}' not found.`,
    };
  }

  // STRICT INVARIANT: Must be approved before publishing.
  // Allowed states: 'approved', or 'partially_published' / 'failed' for retrying failed channels.
  // Explicit approval timestamp (approvedAt) is required in all cases.
  const isApprovedForPublish =
    (post.status === "approved" ||
      post.status === "partially_published" ||
      post.status === "failed") &&
    post.approvedAt !== null;

  if (!isApprovedForPublish) {
    return {
      success: false,
      post: formatPostRecord(post),
      results: [],
      error: `Content post cannot be published because its current status is '${post.status}'. Explicit human approval is required before publishing.`,
    };
  }

  // Parse saved/approved target channels
  let approvedChannels: PublishChannel[] = [];
  if (Array.isArray(post.targetChannels)) {
    approvedChannels = post.targetChannels as PublishChannel[];
  } else if (typeof post.targetChannels === "string") {
    try {
      const parsed = JSON.parse(post.targetChannels);
      if (Array.isArray(parsed)) {
        approvedChannels = parsed as PublishChannel[];
      }
    } catch {
      approvedChannels = [];
    }
  }

  if (approvedChannels.length === 0) {
    approvedChannels = ["website", "linkedin", "newsletter"];
  }

  let channelsToPublish: PublishChannel[] = [];

  if (options?.forcedChannels !== undefined) {
    if (!Array.isArray(options.forcedChannels) || options.forcedChannels.length === 0) {
      return {
        success: false,
        post: formatPostRecord(post),
        results: [],
        error: "Validation error: 'channels' must be a non-empty array of supported channels.",
      };
    }

    // 1. Validate that all requested channels are supported channel names
    for (const ch of options.forcedChannels) {
      if (!SUPPORTED_CHANNELS.includes(ch)) {
        return {
          success: false,
          post: formatPostRecord(post),
          results: [],
          error: `Invalid channel '${String(ch)}'. Supported channels are: website, linkedin, newsletter.`,
        };
      }
    }

    // 2. Strict guardrail: requested channels must match the approved channel selection.
    // When in 'approved' status, unapproved additional channels or altered subsets require renewed approval.
    // When in 'partially_published' or 'failed' (retrying), forcedChannels must be a subset of approved channels.
    const sortedApproved = [...new Set(approvedChannels)].sort();
    const sortedRequested = [...new Set(options.forcedChannels)].sort();

    if (post.status === "approved") {
      const matchesApproved =
        sortedApproved.length === sortedRequested.length &&
        sortedApproved.every((ch, i) => ch === sortedRequested[i]);

      if (!matchesApproved) {
        return {
          success: false,
          post: formatPostRecord(post),
          results: [],
          error: `Channel selection mismatch: Requested channels [${sortedRequested.join(", ")}] do not match the approved channel selection [${sortedApproved.join(", ")}]. Channel modifications require renewed approval before publication.`,
        };
      }
    } else {
      // In partially_published / failed (retry mode), all requested channels must be in approvedChannels
      const unapprovedChannel = sortedRequested.find((ch) => !approvedChannels.includes(ch));
      if (unapprovedChannel) {
        return {
          success: false,
          post: formatPostRecord(post),
          results: [],
          error: `Channel selection mismatch: Requested channel '${unapprovedChannel}' is not part of the approved channel selection [${sortedApproved.join(", ")}]. Channel modifications require renewed approval before publication.`,
        };
      }
    }

    channelsToPublish = sortedRequested as PublishChannel[];
  } else {
    // Validate saved approved channels
    for (const ch of approvedChannels) {
      if (!SUPPORTED_CHANNELS.includes(ch)) {
        return {
          success: false,
          post: formatPostRecord(post),
          results: [],
          error: `Invalid channel '${String(ch)}'. Supported channels are: website, linkedin, newsletter.`,
        };
      }
    }
    channelsToPublish = approvedChannels;
  }

  // Parse structured channel contents
  let linkedinData: LinkedInPostContent | null = null;
  let newsletterData: NewsletterContent | null = null;
  let websiteData: WebsiteAnnouncementContent | null = null;

  try {
    if (post.linkedinContent) {
      linkedinData = typeof post.linkedinContent === "string" && post.linkedinContent.startsWith("{")
        ? JSON.parse(post.linkedinContent)
        : { postText: post.linkedinContent, hashtags: [], characterCount: post.linkedinContent.length };
    }
    if (post.newsletterContent) {
      newsletterData = typeof post.newsletterContent === "string" && post.newsletterContent.startsWith("{")
        ? JSON.parse(post.newsletterContent)
        : { subject: post.title, previewText: "", bodyText: post.newsletterContent, callToAction: "" };
    }
    if (post.websiteContent) {
      websiteData = typeof post.websiteContent === "string" && post.websiteContent.startsWith("{")
        ? JSON.parse(post.websiteContent)
        : { title: post.title, subtitle: "", slug: post.id, bodyMarkdown: post.websiteContent, tags: [] };
    }
  } catch (err: unknown) {
    console.warn("Failed to parse stored JSON channel content, using fallback formatting:", err);
  }

  // 3. Skip channels that already have a successful log (no double publish).
  // Retrying republishes only failed channels.
  const successfulLogsByChannel = new Map<PublishChannel, PublishingLog>();
  for (const log of post.publishingLogs || []) {
    if (log.status === "published" || log.status === "success") {
      successfulLogsByChannel.set(log.channel as PublishChannel, log);
    }
  }

  const channelsToDispatch = channelsToPublish.filter((ch) => !successfulLogsByChannel.has(ch));
  const results: ChannelPublishResult[] = [];

  // Include skipped channels that were already published successfully
  for (const ch of channelsToPublish) {
    if (successfulLogsByChannel.has(ch)) {
      const existingLog = successfulLogsByChannel.get(ch)!;
      results.push({
        channel: ch,
        status: existingLog.status as PublishLogStatus,
        publishedUrl: existingLog.publishedUrl,
        responsePayload: (existingLog.responsePayload as Record<string, unknown>) || undefined,
      });
    }
  }

  for (const channel of channelsToDispatch) {
    const channelResult = await dispatchToChannel(channel, {
      postId: post.id,
      title: post.title,
      linkedin: linkedinData,
      newsletter: newsletterData,
      website: websiteData,
    });
    results.push(channelResult);

    // Save audit log
    await prisma.publishingLog.create({
      data: {
        postId: post.id,
        channel: channelResult.channel,
        status: channelResult.status,
        publishedUrl: channelResult.publishedUrl,
        responsePayload: (channelResult.responsePayload || {}) as Prisma.InputJsonValue,
        errorMessage: channelResult.errorMessage || null,
      },
    });
  }

  const allSuccessfulChannelNames = new Set<string>([
    ...Array.from(successfulLogsByChannel.keys()),
    ...results.filter((r) => r.status === "published" || r.status === "success").map((r) => r.channel),
  ]);

  const allApprovedSuccessful = approvedChannels.every((ch) => allSuccessfulChannelNames.has(ch));
  const anyApprovedSuccessful = approvedChannels.some((ch) => allSuccessfulChannelNames.has(ch));

  let finalStatus: "published" | "partially_published" | "failed" = "published";
  if (allApprovedSuccessful) {
    finalStatus = "published";
  } else if (anyApprovedSuccessful) {
    finalStatus = "partially_published";
  } else {
    finalStatus = "failed";
  }

  const updatedPost = await prisma.contentPost.update({
    where: { id: post.id },
    data: {
      status: finalStatus,
      publishedAt:
        finalStatus === "published"
          ? new Date()
          : post.publishedAt || (anyApprovedSuccessful ? new Date() : null),
    },
    include: { publishingLogs: true },
  });

  return {
    success: anyApprovedSuccessful,
    post: formatPostRecord(updatedPost),
    results,
  };
}

/**
 * Dispatches publication to a specific channel via real HTTP call to the sandbox endpoint
 * or external live webhook if configured.
 */
async function dispatchToChannel(
  channel: PublishChannel,
  payload: {
    postId: string;
    title: string;
    linkedin: LinkedInPostContent | null;
    newsletter: NewsletterContent | null;
    website: WebsiteAnnouncementContent | null;
  }
): Promise<ChannelPublishResult> {
  const baseUrl = (process.env.SANDBOX_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const apiKey = process.env.SANDBOX_API_KEY || "sandbox_demo_secret_key";
  const defaultHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  try {
    let url = "";
    let bodyData: unknown = {};

    switch (channel) {
      case "website": {
        url = process.env.CMS_WEBHOOK_URL || process.env.WORDPRESS_API_URL || `${baseUrl}/api/sandbox/cms/posts`;
        bodyData = {
          title: payload.website?.title || payload.title,
          slug: payload.website?.slug,
          content: payload.website?.bodyMarkdown,
          status: "publish",
          tags: payload.website?.tags || [],
        };
        break;
      }
      case "linkedin": {
        url = process.env.LINKEDIN_WEBHOOK_URL || `${baseUrl}/api/sandbox/linkedin/posts`;
        bodyData = {
          text: payload.linkedin?.postText || payload.title,
          hashtags: payload.linkedin?.hashtags || [],
        };
        break;
      }
      case "newsletter": {
        url = process.env.NEWSLETTER_WEBHOOK_URL || `${baseUrl}/api/sandbox/newsletter/send`;
        bodyData = {
          subject: payload.newsletter?.subject || payload.title,
          preview: payload.newsletter?.previewText || "",
          body: payload.newsletter?.bodyText || "",
          cta: payload.newsletter?.callToAction || "",
        };
        break;
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: defaultHeaders,
      body: JSON.stringify(bodyData),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const link =
        typeof data.link === "string"
          ? data.link
          : typeof data.url === "string"
          ? data.url
          : typeof data.shareUrl === "string"
          ? data.shareUrl
          : `${baseUrl}/sandbox/${channel === "website" ? "news" : channel}/${payload.postId}`;

      return {
        channel,
        status: "published",
        publishedUrl: link,
        responsePayload: data,
      };
    }

    const errorBody = await res.text().catch(() => res.statusText);
    return {
      channel,
      status: "failed",
      publishedUrl: null,
      errorMessage: `${channel.toUpperCase()} API responded with ${res.status}: ${errorBody}`,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? `${channel.toUpperCase()} dispatch timed out after 10000ms`
          : err.message
        : `${channel.toUpperCase()} network dispatch failed`;

    return {
      channel,
      status: "failed",
      publishedUrl: null,
      errorMessage: errorMsg,
    };
  }
}

function formatPostRecord(
  raw: ContentPost & { publishingLogs?: PublishingLog[] }
): ContentPostRecord {
  return {
    id: raw.id,
    title: raw.title,
    sourcePrompt: raw.sourcePrompt,
    contentType: raw.contentType as ContentKind,
    status: raw.status as ContentStatus,
    linkedinContent: raw.linkedinContent,
    newsletterContent: raw.newsletterContent,
    websiteContent: raw.websiteContent,
    targetChannels: Array.isArray(raw.targetChannels)
      ? (raw.targetChannels as unknown as PublishChannel[])
      : typeof raw.targetChannels === "string"
      ? (JSON.parse(raw.targetChannels) as PublishChannel[])
      : [],
    metadata:
      typeof raw.metadata === "object" && raw.metadata !== null
        ? (raw.metadata as Record<string, unknown>)
        : {},
    rejectionReason: raw.rejectionReason,
    approvedAt: raw.approvedAt ? raw.approvedAt.toISOString() : null,
    publishedAt: raw.publishedAt ? raw.publishedAt.toISOString() : null,
    createdAt: raw.createdAt.toISOString(),
    updatedAt: raw.updatedAt.toISOString(),
    publishingLogs: raw.publishingLogs?.map((l: PublishingLog) => ({
      id: l.id,
      postId: l.postId,
      channel: l.channel as PublishChannel,
      status: l.status as PublishLogStatus,
      publishedUrl: l.publishedUrl,
      responsePayload:
        typeof l.responsePayload === "object" && l.responsePayload !== null
          ? (l.responsePayload as Record<string, unknown>)
          : null,
      errorMessage: l.errorMessage,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}
