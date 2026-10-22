import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateContentWithGemini } from "@/lib/content/gemini-content";
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
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
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

    const [total, posts] = await Promise.all([
      prisma.contentPost.count({ where }),
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

    return NextResponse.json({
      success: true,
      data: formattedPosts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
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

    // Call Gemini AI Generation Service
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
