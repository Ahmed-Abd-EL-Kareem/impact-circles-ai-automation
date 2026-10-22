import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateContentWithGemini } from "@/lib/content/gemini-content";
import { dispatchContentToN8nWorkflow } from "@/lib/services/workflow-client";
import { ContentKind, ContentStatus } from "@/lib/types/content";
import { Prisma } from "@prisma/client";

/**
 * GET /api/content
 * Returns list of content posts with filtering and search.
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const status = searchParams.get("status") as ContentStatus | null;
    const contentType = searchParams.get("type") as ContentKind | null;
    const search = searchParams.get("search")?.trim() || "";

    const where: Prisma.ContentPostWhereInput = {};

    if (
      status &&
      ["draft", "in_review", "approved", "published", "partially_published", "rejected", "failed"].includes(
        status
      )
    ) {
      where.status = status;
    }

    if (contentType && ["research_update", "event_announcement", "project_findings"].includes(contentType)) {
      where.contentType = contentType;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { sourcePrompt: { contains: search, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;

    const [totalMatching, totalGlobal, draftCount, approvedCount, publishedCount, posts] =
      await Promise.all([
        prisma.contentPost.count({ where }),
        prisma.contentPost.count(),
        prisma.contentPost.count({ where: { status: { in: ["draft", "in_review"] } } }),
        prisma.contentPost.count({ where: { status: "approved" } }),
        prisma.contentPost.count({ where: { status: { in: ["published", "partially_published"] } } }),
        prisma.contentPost.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          include: {
            publishingLogs: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        }),
      ]);

    const formattedPosts = posts.map((p) => ({
      id: p.id,
      title: p.title,
      sourcePrompt: p.sourcePrompt,
      contentType: p.contentType,
      status: p.status,
      linkedinContent: p.linkedinContent,
      newsletterContent: p.newsletterContent,
      websiteContent: p.websiteContent,
      targetChannels: Array.isArray(p.targetChannels)
        ? p.targetChannels
        : typeof p.targetChannels === "string"
        ? JSON.parse(p.targetChannels)
        : [],
      metadata: typeof p.metadata === "object" && p.metadata !== null ? p.metadata : {},
      rejectionReason: p.rejectionReason,
      approvedAt: p.approvedAt ? p.approvedAt.toISOString() : null,
      publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      publishingLogs: p.publishingLogs.map((l) => ({
        id: l.id,
        postId: l.postId,
        channel: l.channel,
        status: l.status,
        publishedUrl: l.publishedUrl,
        responsePayload: l.responsePayload,
        errorMessage: l.errorMessage,
        createdAt: l.createdAt.toISOString(),
      })),
    }));

    return NextResponse.json(
      {
        success: true,
        data: formattedPosts,
        pagination: {
          page,
          limit,
          total: totalMatching,
          totalPages: Math.ceil(totalMatching / limit) || 1,
        },
        counts: {
          total: totalGlobal,
          draft: draftCount,
          approved: approvedCount,
          published: publishedCount,
        },
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, stale-while-revalidate=30",
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        success: false,
        error: `Failed to query content posts: ${message}`,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/content
 * Generates tailored multi-channel content using Gemini AI and creates a new ContentPost record.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const promptText = typeof body.promptText === "string" ? body.promptText.trim() : "";
    const contentType = (body.contentType || "research_update") as ContentKind;
    const additionalInstructions = typeof body.additionalInstructions === "string" ? body.additionalInstructions.trim() : undefined;
    const VALID_CHANNELS = ["website", "linkedin", "newsletter"];
    let targetChannels = ["website", "linkedin", "newsletter"];

    if (body.targetChannels !== undefined) {
      if (!Array.isArray(body.targetChannels) || body.targetChannels.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Validation error: 'targetChannels' must be a non-empty array of supported channels.",
          },
          { status: 400 }
        );
      }

      for (const ch of body.targetChannels) {
        if (!VALID_CHANNELS.includes(ch)) {
          return NextResponse.json(
            {
              success: false,
              error: `Invalid channel '${String(ch)}'. Supported channels are: website, linkedin, newsletter.`,
            },
            { status: 400 }
          );
        }
      }
      targetChannels = body.targetChannels;
    }

    if (!promptText || promptText.length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: "Content prompt must be at least 10 characters long describing the research update, findings, or event.",
        },
        { status: 400 }
      );
    }

    if (!["research_update", "event_announcement", "project_findings"].includes(contentType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid contentType. Allowed values: research_update, event_announcement, project_findings.",
        },
        { status: 400 }
      );
    }

    // 1. Dispatch to n8n orchestration workflow if N8N_CONTENT_WEBHOOK_URL is configured
    if (process.env.N8N_CONTENT_WEBHOOK_URL) {
      const n8nResult = await dispatchContentToN8nWorkflow({
        action: "generate",
        sourcePrompt: promptText,
        contentType,
        additionalInstructions,
        targetChannels,
      });

      if (!n8nResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: n8nResult.error,
          },
          { status: n8nResult.statusCode || 502 }
        );
      }

      // If n8n created the post, return the persisted post record
      const postRecord = n8nResult.post || n8nResult.data?.post;
      return NextResponse.json(
        {
          success: true,
          post: postRecord,
        },
        { status: 201 }
      );
    }

    // 2. Direct Gemini AI Generation Service fallback
    const aiResult = await generateContentWithGemini(promptText, contentType, additionalInstructions);

    if (!aiResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: aiResult.error,
        },
        { status: 502 }
      );
    }

    const generated = aiResult.data;

    // Persist to Neon PostgreSQL
    const createdPost = await prisma.contentPost.create({
      data: {
        title: generated.title || "Untitled Announcement",
        sourcePrompt: promptText,
        contentType,
        status: "draft",
        linkedinContent: JSON.stringify(generated.linkedin),
        newsletterContent: JSON.stringify(generated.newsletter),
        websiteContent: JSON.stringify(generated.website),
        targetChannels,
        metadata: {
          executiveSummary: generated.summary,
          generatedAt: new Date().toISOString(),
          additionalInstructions: additionalInstructions || null,
        },
      },
      include: {
        publishingLogs: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        post: {
          id: createdPost.id,
          title: createdPost.title,
          sourcePrompt: createdPost.sourcePrompt,
          contentType: createdPost.contentType,
          status: createdPost.status,
          linkedinContent: createdPost.linkedinContent,
          newsletterContent: createdPost.newsletterContent,
          websiteContent: createdPost.websiteContent,
          targetChannels: createdPost.targetChannels,
          metadata: createdPost.metadata,
          approvedAt: null,
          publishedAt: null,
          createdAt: createdPost.createdAt.toISOString(),
          updatedAt: createdPost.updatedAt.toISOString(),
          publishingLogs: [],
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      {
        success: false,
        error: `Unexpected error during content creation: ${message}`,
      },
      { status: 500 }
    );
  }
}
