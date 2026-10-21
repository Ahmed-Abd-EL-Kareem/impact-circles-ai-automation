"use client";

import React, { useState, useEffect } from "react";
import { ContentGeneratorForm } from "./ContentGeneratorForm";
import { ContentReviewModal } from "./ContentReviewModal";
import { ContentPostRecord, ContentStatus } from "@/lib/types/content";

export function ContentAgentView() {
  const [posts, setPosts] = useState<ContentPostRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPost, setSelectedPost] = useState<ContentPostRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadData() {
      try {
        const params = new URLSearchParams();
        if (filterStatus !== "all") params.set("status", filterStatus);
        if (searchQuery.trim()) params.set("search", searchQuery.trim());

        const res = await fetch(`/api/content?${params.toString()}`);
        const data = await res.json();

        if (ignore) return;

        if (data.success) {
          setPosts(data.data);
        } else {
          setError(data.error || "Failed to fetch content packages.");
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      ignore = true;
    };
  }, [filterStatus, searchQuery]);

  const handleGeneratedSuccess = (newPost: ContentPostRecord) => {
    setPosts((prev) => [newPost, ...prev]);
    setSelectedPost(newPost); // automatically open review modal for immediate human review
  };

  const handlePostUpdated = (updated: ContentPostRecord) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setSelectedPost(updated);
  };

  const handleDeletePost = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this content package?")) return;

    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
        if (selectedPost?.id === id) setSelectedPost(null);
      }
    } catch {
      alert("Failed to delete post");
    }
  };

  // Telemetry counts
  const draftCount = posts.filter((p) => p.status === "draft" || p.status === "in_review").length;
  const approvedCount = posts.filter((p) => p.status === "approved").length;
  const publishedCount = posts.filter((p) => p.status === "published" || p.status === "partially_published").length;

  const renderStatusBadge = (status: ContentStatus) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case "published":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            Published
          </span>
        );
      case "partially_published":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Partial
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Rejected
          </span>
        );
      case "in_review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Re-approval Needed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Draft
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Telemetry Summary Cards */}
      <section aria-labelledby="content-telemetry" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-5 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Total Packages</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {posts.length}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400 font-mono">Neon DB Storage</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-5 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60">
          <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Pending Review</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {draftCount}
          </div>
          <div className="mt-1 text-[11px] text-amber-600/80 font-mono">Requires Human Approval</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-5 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60">
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Approved & Ready</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {approvedCount}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600/80 font-mono">Ready to Publish</div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-5 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60">
          <div className="text-[11px] font-medium text-sky-600 dark:text-sky-400">Published Live</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {publishedCount}
          </div>
          <div className="mt-1 text-[11px] text-sky-600/80 font-mono">Multi-Channel Broadcast</div>
        </div>
      </section>

      {/* Generation Form Card */}
      <section
        aria-labelledby="generator-heading"
        className="rounded-3xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-6 sm:p-7 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60"
      >
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 id="generator-heading" className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              AI Content Generation
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Transform research findings or event announcements into 3 tailored channels (Website, LinkedIn, Newsletter) via Google Gemini.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-zinc-50 px-2.5 py-1 font-mono text-[11px] text-zinc-600 dark:border-white/[0.06] dark:bg-zinc-800 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Human-in-the-Loop Guardrail
          </span>
        </div>
        <ContentGeneratorForm onSuccess={handleGeneratedSuccess} />
      </section>

      {/* Content Ledger & Queue Section */}
      <section aria-labelledby="queue-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 id="queue-heading" className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Content Pipeline & Publication Queue
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Click any item to review, edit tailored versions, approve, or trigger automated publishing.
            </p>
          </div>

          {/* Search & Filter toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search packages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-black/[0.1] bg-white px-3 py-1.5 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
            />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-black/[0.1] bg-white px-3 py-1.5 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Drafts</option>
              <option value="in_review">In Review / Re-approval</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        )}

        {/* Content Items List */}
        {isLoading ? (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-black/[0.06] bg-white/50 dark:border-white/[0.06] dark:bg-zinc-900/40">
            <span className="text-xs text-zinc-400 animate-pulse font-medium">Loading content pipeline...</span>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-black/[0.1] bg-white/40 p-12 text-center dark:border-white/[0.1] dark:bg-zinc-900/30">
            <svg className="h-10 w-10 text-zinc-300 dark:text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No content packages found</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
              Use the AI generator form above to produce your first tailored 3-channel content package.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="apple-press group rounded-2xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-5 shadow-xs hover:border-black/20 hover:shadow-md transition-all dark:border-white/[0.08] dark:bg-zinc-900/60 dark:hover:border-white/20 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-mono font-semibold uppercase text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
                      {post.contentType.replace("_", " ")}
                    </span>
                    {renderStatusBadge(post.status)}
                  </div>

                  <h3 className="mt-3 text-sm font-bold text-zinc-900 dark:text-zinc-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                    {post.title}
                  </h3>

                  <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                    {post.sourcePrompt}
                  </p>

                  {/* Channels Badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {post.targetChannels?.map((ch, idx) => (
                      <span
                        key={idx}
                        className="rounded-md border border-black/[0.05] bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-white/[0.05] dark:bg-zinc-800/80 dark:text-zinc-300"
                      >
                        {ch === "website" ? "🌐 Website" : ch === "linkedin" ? "💼 LinkedIn" : "📬 Newsletter"}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-black/[0.05] pt-3 dark:border-white/[0.05]">
                  <span className="font-mono text-[10px] text-zinc-400">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDeletePost(post.id, e)}
                      className="rounded-lg p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      title="Delete package"
                      aria-label="Delete package"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                      Review & Approve &rarr;
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review Modal */}
      {selectedPost && (
        <ContentReviewModal
          key={selectedPost.id}
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPostUpdated={handlePostUpdated}
        />
      )}
    </div>
  );
}
