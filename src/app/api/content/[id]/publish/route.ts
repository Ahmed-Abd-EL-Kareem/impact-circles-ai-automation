import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { publishContentPost, SUPPORTED_CHANNELS } from "@/lib/services/publishing";
import { verifyReviewerPasscode } from "@/lib/services/reviewer-auth";
import { dispatchContentToN8nWorkflow } from "@/lib/services/workflow-client";
import { prisma } from "@/lib/db";
import { PublishChannel } from "@/lib/types/content";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/content/[id]/publish
 * Executes automated publishing for an approved ContentPost.
 * INVARIANT: Publication will strictly fail if human approval has not been granted.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = verifyReviewerPasscode(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { id } = await params;
    let forcedChannels: PublishChannel[] | undefined = undefined;

    try {
      const body = await req.json();
      if (body?.channels !== undefined) {
        if (!Array.isArray(body.channels) || body.channels.length === 0) {
          return NextResponse.json(
            {
              success: false,
              error: "Invalid request: 'channels' must be a non-empty array of supported channels.",
            },
            { status: 400 }
          );
        }

        for (const ch of body.channels) {
          if (!SUPPORTED_CHANNELS.includes(ch)) {
            return NextResponse.json(
              {
                success: false,
                error: `Invalid channel '${String(ch)}'. Supported channels are: website, linkedin, newsletter.`,
              },
              { status: 400 }
            );
          }
        }

        forcedChannels = body.channels as PublishChannel[];
      }
    } catch {
      // Empty or non-JSON body is valid, defaults to post's targetChannels
    }

    if (process.env.N8N_CONTENT_WEBHOOK_URL) {
      const n8nResult = await dispatchContentToN8nWorkflow({
        action: "publish",
        postId: id,
        channels: forcedChannels,
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

      const updatedPost = await prisma.contentPost.findUnique({
        where: { id },
        include: {
          publishingLogs: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      try {
        revalidatePath("/sandbox");
      } catch {}

      return NextResponse.json({
        success: true,
        message: "Automated publishing dispatch completed for selected channels via n8n.",
        post: updatedPost,
        results: n8nResult.results,
      });
    }

    const result = await publishContentPost(id, { forcedChannels });

    if (!result.success) {
      if (result.error?.includes("not found")) {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
          },
          { status: 404 }
        );
      }

      const isClientError =
        result.error?.includes("Explicit human approval is required") ||
        result.error?.includes("Channel selection mismatch") ||
        result.error?.includes("Channel mismatch") ||
        result.error?.includes("Validation error") ||
        result.error?.includes("Invalid channel");

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Publishing execution failed.",
          post: result.post,
          results: result.results,
        },
        { status: isClientError ? 400 : 502 }
      );
    }

    try {
      revalidatePath("/sandbox");
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Automated publishing dispatch completed for selected channels (Sandbox).",
      post: result.post,
      results: result.results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: `Publishing execution error: ${message}` },
      { status: 500 }
    );
  }
}
