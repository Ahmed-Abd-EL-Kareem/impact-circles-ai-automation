import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const instant = false;

export default async function SandboxNewsletterPage({ params }: PageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  const publication = await prisma.sandboxPublication.findFirst({
    where: {
      channel: "newsletter",
      OR: [
        { externalId: decodedId },
        { externalId: id },
        { slug: decodedId },
        { slug: id },
        { id: decodedId },
        { id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!publication) {
    notFound();
  }

  const content = publication.content as Record<string, unknown>;
  const subject = typeof content.subject === "string" ? content.subject : publication.title;
  const preview =
    typeof content.preview === "string"
      ? content.preview
      : typeof content.previewText === "string"
      ? content.previewText
      : "";
  const body =
    typeof content.body === "string"
      ? content.body
      : typeof content.bodyText === "string"
      ? content.bodyText
      : "";
  const cta =
    typeof content.callToAction === "string"
      ? content.callToAction
      : typeof content.cta === "string"
      ? content.cta
      : null;

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 sm:p-10 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Banner */}
        <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 dark:border-amber-700/50 dark:bg-amber-950/30 p-4 sm:p-5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-sm">
              ⚠
            </span>
            <div>
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Sandbox — Demo Only
              </h2>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Simulating: Email Newsletter Service (Mailchimp / Brevo / Resend) dispatch.
              </p>
            </div>
          </div>
          <Link
            href="/sandbox"
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-400/50 bg-white dark:bg-zinc-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100/50 dark:hover:bg-zinc-800 transition-colors"
          >
            ← Sandbox Index
          </Link>
        </div>

        {/* Email Client Preview Box */}
        <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-md overflow-hidden">
          {/* Email Header */}
          <div className="p-5 sm:p-6 bg-zinc-50/70 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                Email Newsletter Broadcast
              </span>
              <span className="text-xs text-zinc-400">
                {new Date(publication.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {subject}
            </h1>
            {preview && (
              <p className="text-xs text-zinc-500 italic">
                Preview: {preview}
              </p>
            )}
            <div className="text-[11px] text-zinc-400 pt-1">
              From: <strong className="text-zinc-700 dark:text-zinc-300">Impact Circles Digest</strong> &lt;newsletter@impactcircles.org&gt;
            </div>
          </div>

          {/* Email Body */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {body}
            </div>

            {cta && (
              <div className="pt-4 text-center">
                <span className="inline-block px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-xs">
                  {cta}
                </span>
              </div>
            )}
          </div>

          {/* Email Footer */}
          <div className="p-5 bg-zinc-50 dark:bg-zinc-950/40 border-t border-zinc-100 dark:border-zinc-800 text-center space-y-1">
            <p className="text-[11px] text-zinc-400">
              You received this simulated email as part of the Impact Circles community briefing.
            </p>
            <p className="font-mono text-[10px] text-zinc-400">
              Campaign ID: {publication.externalId}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
