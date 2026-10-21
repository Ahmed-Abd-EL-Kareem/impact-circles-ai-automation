import { NextRequest, NextResponse } from "next/server";
import { publishContentPost } from "@/lib/services/publishing";
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
      if (Array.isArray(body?.channels) && body.channels.length > 0) {
        forcedChannels = body.channels as PublishChannel[];
      }
    } catch {
      // Empty or non-JSON body is valid, defaults to post's targetChannels
    }

    const result = await publishContentPost(id, { forcedChannels });

    if (!result.success) {
      const isUnapproved = result.error?.includes("Explicit human approval is required");
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Publishing execution failed.",
          post: result.post,
          results: result.results,
        },
        { status: isUnapproved ? 400 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Content successfully published to selected channels.",
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
