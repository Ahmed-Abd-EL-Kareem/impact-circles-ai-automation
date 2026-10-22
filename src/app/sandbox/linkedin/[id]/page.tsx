import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const instant = false;

export default async function SandboxLinkedInPage({ params }: PageProps) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  const targetUrn = decodedId.startsWith("urn:li:share:") ? decodedId : `urn:li:share:${decodedId}`;

  const publication = await prisma.sandboxPublication.findFirst({
    where: {
      channel: "linkedin",
      OR: [
        { externalId: targetUrn },
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
  const text = typeof content.text === "string" ? content.text : "";
  const hashtags = Array.isArray(content.hashtags) ? (content.hashtags as string[]) : [];

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
                Simulating: LinkedIn Share / UGC Post API destination.
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

        {/* LinkedIn Feed Card */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 flex items-start justify-between border-b border-zinc-100 dark:border-zinc-800/60">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-linear-to-tr from-sky-600 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                IC
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Impact Circles
                  </h3>
                  <span className="text-[11px] text-zinc-400">• 1st</span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Global Catalyst for Regenerative Innovation &amp; Social Impact
                </p>
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 mt-0.5">
                  <span>{new Date(publication.createdAt).toLocaleDateString()}</span>
                  <span>•</span>
                  <span>🌐 Public</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              LinkedIn
            </span>
          </div>

          {/* Post Content */}
          <div className="p-5 space-y-4">
            <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
              {text}
            </p>

            {hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {hashtags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                  >
                    {tag.startsWith("#") ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Simulated LinkedIn Engagements Footer */}
          <div className="bg-zinc-50 dark:bg-zinc-800/40 px-5 py-3 border-t border-zinc-100 dark:border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
            <span className="font-mono text-[11px] truncate max-w-xs">{publication.externalId}</span>
            <div className="flex items-center gap-4">
              <span>👍 Like</span>
              <span>💬 Comment</span>
              <span>↗ Repost</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
