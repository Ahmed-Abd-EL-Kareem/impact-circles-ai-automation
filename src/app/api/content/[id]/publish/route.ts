import { NextRequest, NextResponse } from "next/server";
import { publishContentPost, SUPPORTED_CHANNELS } from "@/lib/services/publishing";
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

    return NextResponse.json({
      success: true,
      message: "Automated demonstration dispatch completed for selected channels (simulated).",
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
