import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSandboxBaseUrl, shouldFailChannel, verifySandboxAuth } from "@/lib/services/sandbox-auth";

export async function POST(req: NextRequest) {
  try {
    const auth = verifySandboxAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    if (shouldFailChannel("newsletter")) {
      return NextResponse.json(
        { error: "Simulated failure for channel 'newsletter' via SANDBOX_FAIL_CHANNELS" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : "Newsletter Broadcast";
    const campaignId = `camp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    const baseUrl = getSandboxBaseUrl(req);
    const publishedUrl = `${baseUrl}/sandbox/newsletter/${campaignId}`;

    await prisma.sandboxPublication.create({
      data: {
        channel: "newsletter",
        externalId: campaignId,
        title: subject,
        slug: campaignId,
        content: body,
        url: publishedUrl,
      },
    });

    return NextResponse.json(
      {
        id: campaignId,
        link: publishedUrl,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Newsletter mock send error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
