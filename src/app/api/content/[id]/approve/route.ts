import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyReviewerPasscode } from "@/lib/services/reviewer-auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/content/[id]/approve
 * Human-in-the-loop review endpoint. Explicitly approves or rejects a content post.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = verifyReviewerPasscode(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { id } = await params;
    const body = await req.json();
    const action = body.action as "approve" | "reject";
    const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : undefined;
    const VALID_CHANNELS = ["website", "linkedin", "newsletter"];
    const targetChannels = Array.isArray(body.targetChannels) ? body.targetChannels : undefined;

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
    }

    if (!["approve", "reject"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "Invalid action. Expected 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    const existing = await prisma.contentPost.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: `Content post '${id}' not found.` },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (action === "approve") {
      updateData.status = "approved";
      updateData.approvedAt = new Date();
      updateData.rejectionReason = null;
    } else {
      updateData.status = "rejected";
      updateData.approvedAt = null;
      updateData.rejectionReason = rejectionReason || "Rejected during human review.";
    }

    if (targetChannels && targetChannels.length > 0) {
      updateData.targetChannels = targetChannels;
    }

    const updated = await prisma.contentPost.update({
      where: { id },
      data: updateData,
      include: {
        publishingLogs: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: action === "approve" ? "Content approved for publication." : "Content marked as rejected.",
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: `Failed to process approval: ${message}` },
      { status: 500 }
    );
  }
}
