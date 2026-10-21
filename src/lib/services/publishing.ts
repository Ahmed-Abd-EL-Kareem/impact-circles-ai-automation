import { prisma } from "@/lib/db";
import { Prisma, ContentPost, PublishingLog } from "@prisma/client";
import type {
  ContentKind,
  ContentPostRecord,
  ContentStatus,
  PublishChannel,
  PublishLogStatus,
  LinkedInPostContent,
  NewsletterContent,
  WebsiteAnnouncementContent,
} from "../types/content";

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

  // STRICT INVARIANT: Must be approved before publishing
  if (post.status !== "approved") {
    return {
      success: false,
      post: formatPostRecord(post),
      results: [],
      error: `Content post cannot be published because its current status is '${post.status}'. Explicit human approval is required before publishing.`,
    };
  }

  // Parse target channels
  let channelsToPublish: PublishChannel[] = [];
  if (options?.forcedChannels && options.forcedChannels.length > 0) {
    channelsToPublish = options.forcedChannels;
  } else if (Array.isArray(post.targetChannels)) {
    channelsToPublish = post.targetChannels as PublishChannel[];
  } else if (typeof post.targetChannels === "string") {
    try {
      channelsToPublish = JSON.parse(post.targetChannels) as PublishChannel[];
    } catch {
      channelsToPublish = ["website", "linkedin", "newsletter"];
    }
  }

  if (channelsToPublish.length === 0) {
    channelsToPublish = ["website", "linkedin", "newsletter"];
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

  const results: ChannelPublishResult[] = [];

  for (const channel of channelsToPublish) {
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

  const anyFailed = results.some((r) => r.status === "failed");
  const allFailed = results.every((r) => r.status === "failed");

  let finalStatus: "published" | "partially_published" | "failed" = "published";
  if (allFailed) {
    finalStatus = "failed";
  } else if (anyFailed) {
    finalStatus = "partially_published";
  }

  const updatedPost = await prisma.contentPost.update({
    where: { id: post.id },
    data: {
      status: finalStatus,
      publishedAt: new Date(),
    },
    include: { publishingLogs: true },
  });

  return {
    success: !allFailed,
    post: formatPostRecord(updatedPost),
    results,
  };
}

/**
 * Dispatches publication to a specific channel:
 * Uses live endpoint if configured in environment, otherwise uses verified demonstration sandbox.
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
  const timestamp = new Date().toISOString();

  switch (channel) {
    case "website": {
      const cmsUrl = process.env.CMS_WEBHOOK_URL || process.env.WORDPRESS_API_URL;
      if (cmsUrl) {
        try {
          const res = await fetch(cmsUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: payload.website?.title || payload.title,
              content: payload.website?.bodyMarkdown,
              slug: payload.website?.slug,
              tags: payload.website?.tags,
            }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
              channel: "website",
              status: "success",
              publishedUrl: data.url || `${cmsUrl.replace(/\/api.*$/, "")}/${payload.website?.slug || payload.postId}`,
              responsePayload: data,
            };
          }
          return {
            channel: "website",
            status: "failed",
            publishedUrl: null,
            errorMessage: `CMS API responded with ${res.status}: ${await res.text()}`,
          };
        } catch (e) {
          return {
            channel: "website",
            status: "failed",
            publishedUrl: null,
            errorMessage: e instanceof Error ? e.message : "CMS network connection failed",
          };
        }
      }

      // Demonstration / Sandbox Publishing Mode
      const slug = payload.website?.slug || `post-${payload.postId.slice(0, 8)}`;
      const demoUrl = `https://impactcircles.org/announcements/${slug}`;
      return {
        channel: "website",
        status: "simulated",
        publishedUrl: demoUrl,
        responsePayload: {
          mode: "sandbox_demonstration",
          provider: "Impact Circles Website CMS (Demo API)",
          publishedAt: timestamp,
          slug,
          tags: payload.website?.tags || [],
        },
      };
    }

    case "linkedin": {
      const linkedinWebhook = process.env.LINKEDIN_WEBHOOK_URL;
      if (linkedinWebhook) {
        try {
          const res = await fetch(linkedinWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: payload.linkedin?.postText,
              hashtags: payload.linkedin?.hashtags,
            }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
              channel: "linkedin",
              status: "success",
              publishedUrl: data.shareUrl || `https://linkedin.com/feed/update/urn:li:share:${payload.postId}`,
              responsePayload: data,
            };
          }
          return {
            channel: "linkedin",
            status: "failed",
            publishedUrl: null,
            errorMessage: `LinkedIn webhook responded with ${res.status}`,
          };
        } catch (e) {
          return {
            channel: "linkedin",
            status: "failed",
            publishedUrl: null,
            errorMessage: e instanceof Error ? e.message : "LinkedIn connection failed",
          };
        }
      }

      // Demonstration / Sandbox Publishing Mode
      const shareId = `ic_li_${payload.postId.slice(-8)}`;
      return {
        channel: "linkedin",
        status: "simulated",
        publishedUrl: `https://linkedin.com/feed/update/urn:li:share:${shareId}`,
        responsePayload: {
          mode: "sandbox_demonstration",
          provider: "LinkedIn REST API (Demo Integration)",
          publishedAt: timestamp,
          hashtags: payload.linkedin?.hashtags || [],
          characterCount: payload.linkedin?.characterCount || 0,
        },
      };
    }

    case "newsletter": {
      const newsletterWebhook = process.env.NEWSLETTER_WEBHOOK_URL;
      if (newsletterWebhook) {
        try {
          const res = await fetch(newsletterWebhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: payload.newsletter?.subject || payload.title,
              body: payload.newsletter?.bodyText,
              preview: payload.newsletter?.previewText,
              cta: payload.newsletter?.callToAction,
            }),
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
              channel: "newsletter",
              status: "success",
              publishedUrl: data.campaignUrl || `https://impactcircles.org/newsletter/${payload.postId}`,
              responsePayload: data,
            };
          }
          return {
            channel: "newsletter",
            status: "failed",
            publishedUrl: null,
            errorMessage: `Newsletter webhook responded with ${res.status}`,
          };
        } catch (e) {
          return {
            channel: "newsletter",
            status: "failed",
            publishedUrl: null,
            errorMessage: e instanceof Error ? e.message : "Newsletter connection failed",
          };
        }
      }

      // Demonstration / Sandbox Publishing Mode
      return {
        channel: "newsletter",
        status: "simulated",
        publishedUrl: `https://impactcircles.org/newsletter/edition-${payload.postId.slice(0, 8)}`,
        responsePayload: {
          mode: "sandbox_demonstration",
          provider: "Impact Circles Newsletter Broadcaster (Demo API)",
          publishedAt: timestamp,
          subject: payload.newsletter?.subject || payload.title,
          callToAction: payload.newsletter?.callToAction || "",
        },
      };
    }
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
