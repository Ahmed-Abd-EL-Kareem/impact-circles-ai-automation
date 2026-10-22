import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { SandboxRefreshControl } from "@/components/sandbox/SandboxRefreshControl";

export const instant = false;

export const metadata: Metadata = {
  title: "Sandbox Publishing Records • Impact Circles",
  description:
    "Live mock records dispatched to Website CMS, LinkedIn, and Newsletter sandbox targets during automated publishing execution.",
};

function getCleanSandboxHref(pub: { channel: string; slug: string | null; externalId: string; url: string }): string {
  if (pub.url) {
    try {
      if (pub.url.startsWith("http://") || pub.url.startsWith("https://")) {
        const u = new URL(pub.url);
        if (u.pathname.startsWith("/sandbox")) {
          return u.pathname;
        }
      }
    } catch {}
  }
  const ch = pub.channel === "website" ? "news" : pub.channel;
  const target = pub.slug || pub.externalId;
  return `/sandbox/${ch}/${encodeURIComponent(target)}`;
}

function getDisplayUrl(rawUrl: string, pub: { channel: string; slug: string | null; externalId: string }): string {
  if (!rawUrl) {
    const ch = pub.channel === "website" ? "news" : pub.channel;
    return `http://localhost:3000/sandbox/${ch}/${encodeURIComponent(pub.slug || pub.externalId)}`;
  }
  return rawUrl.replace(/http:\/\/(127\.0\.0\.1|localhost):3001/, "http://localhost:3000");
}

export default async function SandboxIndexPage() {
  const publications = await prisma.sandboxPublication.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 sm:p-10 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Banner with Clear Context */}
        <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 dark:border-amber-700/50 dark:bg-amber-950/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold text-sm">
              ⚠
            </span>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
                Sandbox Environment — Demo Mock Targets
              </h2>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90">
                This destination displays published records from the <strong>AI Content Generation & Publishing Agent</strong> (Website CMS, LinkedIn, and Newsletter).
              </p>
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                Processed receipts, invoices, and expense ledger items live on the{" "}
                <Link href="/?tab=finance" className="underline font-semibold hover:text-amber-900 dark:hover:text-amber-200">
                  Financial Document Assistant Dashboard
                </Link>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            <Link
              href="/?tab=content"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-amber-400/50 bg-white dark:bg-zinc-900 text-amber-900 dark:text-amber-200 hover:bg-amber-100/50 dark:hover:bg-zinc-800 transition-colors shadow-xs"
            >
              Content Agent →
            </Link>
            <Link
              href="/?tab=finance"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-xs"
            >
              Finance Dashboard →
            </Link>
          </div>
        </div>

        {/* Title Header with Live Refresh Control */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sandbox Published Records</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Real HTTP POST dispatches received and saved during automated publishing execution.
            </p>
          </div>

          <SandboxRefreshControl initialCount={publications.length} />
        </div>

        {/* List */}
        {publications.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 text-center space-y-3">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
              No sandbox publications have been created yet.
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-md mx-auto">
              Generate a content package in the Content Agent view, approve it, and click &ldquo;Publish to Selected Channels&rdquo; to see live dispatch results here.
            </p>
            <div className="pt-2">
              <Link
                href="/?tab=content"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
              >
                Go to Content Agent →
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {publications.map((pub) => {
              const channelColors: Record<string, string> = {
                website: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
                linkedin: "bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300",
                newsletter: "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300",
              };

              return (
                <div
                  key={pub.id}
                  className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          channelColors[pub.channel] || "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {pub.channel}
                      </span>
                      <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                        {pub.externalId}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {pub.title}
                    </h3>
                    <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-md">
                      {getDisplayUrl(pub.url, pub)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                      {new Date(pub.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <a
                      href={getCleanSandboxHref(pub)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 transition-opacity"
                    >
                      Open View ↗
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
