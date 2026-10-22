import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSandboxBaseUrl, shouldFailChannel, verifySandboxAuth } from "@/lib/services/sandbox-auth";

export async function POST(req: NextRequest) {
  try {
    const auth = verifySandboxAuth(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    if (shouldFailChannel("linkedin")) {
      return NextResponse.json(
        { error: "Simulated failure for channel 'linkedin' via SANDBOX_FAIL_CHANNELS" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawText = typeof body.text === "string" ? body.text : "";
    const title = rawText.slice(0, 70).trim() || "LinkedIn Post";
    const shareUid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const externalId = `urn:li:share:${shareUid}`;

    const baseUrl = getSandboxBaseUrl(req);
    const publishedUrl = `${baseUrl}/sandbox/linkedin/${shareUid}`;

    await prisma.sandboxPublication.create({
      data: {
        channel: "linkedin",
        externalId,
        title,
        slug: shareUid,
        content: body,
        url: publishedUrl,
      },
    });

    try {
      revalidatePath("/sandbox");
      revalidatePath("/sandbox/linkedin/[id]", "page");
    } catch {}

    return NextResponse.json(
      {
        id: externalId,
        link: publishedUrl,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "LinkedIn mock dispatch error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
