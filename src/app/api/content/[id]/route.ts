import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyReviewerPasscode } from "@/lib/services/reviewer-auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/content/[id]
 * Retrieves a single ContentPost by ID with publishing logs.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const post = await prisma.contentPost.findUnique({
      where: { id },
      include: {
        publishingLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!post) {
      return NextResponse.json(
        { success: false, error: `Content post '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        title: post.title,
        sourcePrompt: post.sourcePrompt,
        contentType: post.contentType,
        status: post.status,
        linkedinContent: post.linkedinContent,
        newsletterContent: post.newsletterContent,
        websiteContent: post.websiteContent,
        targetChannels: Array.isArray(post.targetChannels)
          ? post.targetChannels
          : typeof post.targetChannels === "string"
          ? JSON.parse(post.targetChannels)
          : [],
        metadata: typeof post.metadata === "object" && post.metadata !== null ? post.metadata : {},
        rejectionReason: post.rejectionReason,
        approvedAt: post.approvedAt ? post.approvedAt.toISOString() : null,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        publishingLogs: post.publishingLogs.map((l) => ({
          id: l.id,
          postId: l.postId,
          channel: l.channel,
          status: l.status,
          publishedUrl: l.publishedUrl,
          responsePayload: l.responsePayload,
          errorMessage: l.errorMessage,
          createdAt: l.createdAt.toISOString(),
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: `Failed to fetch content post: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/content/[id]
 * Updates content fields or channels.
 * INVARIANT: If content is edited after approval, status is automatically reset
 * to 'in_review' and requires renewed approval before publication.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = verifyReviewerPasscode(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.contentPost.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Content post '${id}' not found.` },
        { status: 404 }
      );
    }

    const updates: Record<string, unknown> = {};
    let contentChanged = false;

    if (typeof body.title === "string" && body.title.trim()) {
      if (body.title.trim() !== existing.title) {
        updates.title = body.title.trim();
        contentChanged = true;
      }
    }

    if (typeof body.linkedinContent === "string") {
      if (body.linkedinContent !== existing.linkedinContent) {
        updates.linkedinContent = body.linkedinContent;
        contentChanged = true;
      }
    }

    if (typeof body.newsletterContent === "string") {
      if (body.newsletterContent !== existing.newsletterContent) {
        updates.newsletterContent = body.newsletterContent;
        contentChanged = true;
      }
    }

    if (typeof body.websiteContent === "string") {
      if (body.websiteContent !== existing.websiteContent) {
        updates.websiteContent = body.websiteContent;
        contentChanged = true;
      }
    }

    const VALID_CHANNELS = ["website", "linkedin", "newsletter"];
    let channelsChanged = false;

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

      // Detect if channel selection changed compared to existing.targetChannels
      let existingChannels: string[] = [];
      if (Array.isArray(existing.targetChannels)) {
        existingChannels = existing.targetChannels.map(String);
      } else if (typeof existing.targetChannels === "string") {
        try {
          const parsed = JSON.parse(existing.targetChannels);
          if (Array.isArray(parsed)) existingChannels = parsed.map(String);
        } catch {
          existingChannels = [];
        }
      }

      const sortedExisting = [...new Set(existingChannels)].sort();
      const sortedIncoming = [...new Set((body.targetChannels as string[]).map(String))].sort();

      if (
        sortedExisting.length !== sortedIncoming.length ||
        sortedExisting.some((ch, idx) => ch !== sortedIncoming[idx])
      ) {
        channelsChanged = true;
      }

      updates.targetChannels = body.targetChannels;
    }

    // Check if status should be reset due to content or channel edits
    // Any edit to approved/published content or channel selection requires renewed approval!
    const wasApprovedOrPublished =
      existing.status === "approved" ||
      existing.status === "published" ||
      existing.status === "partially_published" ||
      existing.status === "failed";

    const approvalReset = (contentChanged || channelsChanged) && wasApprovedOrPublished;

    if (approvalReset) {
      updates.status = "in_review";
      updates.approvedAt = null;
    } else if ((contentChanged || channelsChanged) && existing.status === "rejected") {
      updates.status = "in_review";
      updates.rejectionReason = null;
    }

    const updated = await prisma.contentPost.update({
      where: { id },
      data: updates,
      include: {
        publishingLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({
      success: true,
      post: {
        id: updated.id,
        title: updated.title,
        sourcePrompt: updated.sourcePrompt,
        contentType: updated.contentType,
        status: updated.status,
        linkedinContent: updated.linkedinContent,
        newsletterContent: updated.newsletterContent,
        websiteContent: updated.websiteContent,
        targetChannels: Array.isArray(updated.targetChannels)
          ? updated.targetChannels
          : typeof updated.targetChannels === "string"
          ? JSON.parse(updated.targetChannels)
          : [],
        metadata: typeof updated.metadata === "object" && updated.metadata !== null ? updated.metadata : {},
        rejectionReason: updated.rejectionReason,
        approvedAt: updated.approvedAt ? updated.approvedAt.toISOString() : null,
        publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        publishingLogs: updated.publishingLogs.map((l) => ({
          id: l.id,
          postId: l.postId,
          channel: l.channel,
          status: l.status,
          publishedUrl: l.publishedUrl,
          responsePayload: l.responsePayload,
          errorMessage: l.errorMessage,
          createdAt: l.createdAt.toISOString(),
        })),
      },
      contentChanged,
      channelsChanged,
      approvalReset,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: `Failed to update content post: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content/[id]
 * Deletes content post and cascaded publishing logs.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await prisma.contentPost.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Content post '${id}' deleted successfully.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: `Failed to delete content post: ${message}` },
      { status: 500 }
    );
  }
}
