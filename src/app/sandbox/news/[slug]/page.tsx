import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

interface PageProps {
  params: Promise<{ slug: string }>;
}


export const instant = false;

export default async function SandboxNewsPage({ params }: PageProps) {
  const { slug } = await params;

  const publication = await prisma.sandboxPublication.findFirst({
    where: {
      channel: "website",
      OR: [{ slug }, { externalId: slug }, { id: slug }],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!publication) {
    notFound();
  }

  const content = publication.content as Record<string, unknown>;
  const bodyMarkdown =
    typeof content.content === "string"
      ? content.content
      : typeof content.bodyMarkdown === "string"
      ? content.bodyMarkdown
      : "";
  const subtitle = typeof content.subtitle === "string" ? content.subtitle : null;
  const tags = Array.isArray(content.tags) ? (content.tags as string[]) : [];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 sm:p-10 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
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
                Simulating: Impact Circles Website CMS / WordPress REST API endpoint.
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

        {/* Article Container */}
        <article className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 sm:p-12 shadow-xs space-y-6">
          <div className="space-y-3 border-b border-zinc-100 dark:border-zinc-800 pb-6">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Website Announcement
              </span>
              <span className="text-xs text-zinc-400">
                Published {new Date(publication.createdAt).toLocaleString()}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-zinc-50 leading-tight">
              {publication.title}
            </h1>
            {subtitle && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400 font-medium">
                {subtitle}
              </p>
            )}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {tags.map((tag, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Body Markdown Content */}
          <div className="prose dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed text-sm">
            {bodyMarkdown || <p className="text-zinc-400 italic">No content body provided.</p>}
          </div>

          <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center text-xs text-zinc-400">
            <span>Slug: <code className="font-mono">{publication.slug}</code></span>
            <span>Record ID: <code className="font-mono">{publication.id}</code></span>
          </div>
        </article>
      </div>
    </div>
  );
}
