import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSandboxBaseUrl, shouldFailChannel, verifySandboxAuth } from "@/lib/services/sandbox-auth";

export async function POST(req: NextRequest) {
  try {
    const auth = verifySandboxAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    if (shouldFailChannel("website")) {
      return NextResponse.json(
        { error: "Simulated failure for channel 'website' via SANDBOX_FAIL_CHANNELS" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title : "Website Announcement";
    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? body.slug.trim()
        : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `post-${Date.now()}`;

    const baseUrl = getSandboxBaseUrl(req);
    const publishedUrl = `${baseUrl}/sandbox/news/${slug}`;

    const record = await prisma.sandboxPublication.create({
      data: {
        channel: "website",
        externalId: slug,
        title,
        slug,
        content: body,
        url: publishedUrl,
      },
    });

    return NextResponse.json(
      {
        id: record.id,
        link: publishedUrl,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "CMS mock dispatch error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
