"use client";

import React, { useState } from "react";
import {
  ContentPostRecord,
  PublishChannel,
  LinkedInPostContent,
  NewsletterContent,
  WebsiteAnnouncementContent,
} from "@/lib/types/content";

interface ContentReviewModalProps {
  post: ContentPostRecord;
  onClose: () => void;
  onPostUpdated: (updatedPost: ContentPostRecord) => void;
}

function parseLinkedin(post: ContentPostRecord): { text: string; hashtags: string[] } {
  if (!post.linkedinContent) return { text: "", hashtags: [] };
  try {
    const parsed = JSON.parse(post.linkedinContent);
    return { text: parsed.postText || "", hashtags: parsed.hashtags || [] };
  } catch {
    return { text: post.linkedinContent, hashtags: [] };
  }
}

function parseNewsletter(post: ContentPostRecord): { subject: string; preview: string; body: string; cta: string } {
  if (!post.newsletterContent) return { subject: post.title, preview: "", body: "", cta: "" };
  try {
    const parsed = JSON.parse(post.newsletterContent);
    return {
      subject: parsed.subject || post.title,
      preview: parsed.previewText || "",
      body: parsed.bodyText || "",
      cta: parsed.callToAction || "",
    };
  } catch {
    return { subject: post.title, preview: "", body: post.newsletterContent, cta: "" };
  }
}

function parseWebsite(post: ContentPostRecord): { title: string; subtitle: string; slug: string; markdown: string } {
  if (!post.websiteContent) return { title: post.title, subtitle: "", slug: "", markdown: "" };
  try {
    const parsed = JSON.parse(post.websiteContent);
    return {
      title: parsed.title || post.title,
      subtitle: parsed.subtitle || "",
      slug: parsed.slug || "",
      markdown: parsed.bodyMarkdown || "",
    };
  } catch {
    return { title: post.title, subtitle: "", slug: "", markdown: post.websiteContent };
  }
}

function channelsMatch(a: PublishChannel[], b: PublishChannel[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

export function ContentReviewModal({
  post,
  onClose,
  onPostUpdated,
}: ContentReviewModalProps) {
  const [activeTab, setActiveTab] = useState<"website" | "linkedin" | "newsletter" | "logs">("website");
  const [selectedChannels, setSelectedChannels] = useState<PublishChannel[]>(() => post.targetChannels || ["website", "linkedin", "newsletter"]);

  // Editable fields initialized from post
  const [title, setTitle] = useState(() => post.title);
  const [linkedinText, setLinkedinText] = useState(() => parseLinkedin(post).text);
  const [linkedinHashtags] = useState<string[]>(() => parseLinkedin(post).hashtags);
  const [newsletterSubject, setNewsletterSubject] = useState(() => parseNewsletter(post).subject);
  const [newsletterPreview, setNewsletterPreview] = useState(() => parseNewsletter(post).preview);
  const [newsletterBody, setNewsletterBody] = useState(() => parseNewsletter(post).body);
  const [newsletterCta, setNewsletterCta] = useState(() => parseNewsletter(post).cta);
  const [websiteTitle, setWebsiteTitle] = useState(() => parseWebsite(post).title);
  const [websiteSubtitle, setWebsiteSubtitle] = useState(() => parseWebsite(post).subtitle);
  const [websiteSlug, setWebsiteSlug] = useState(() => parseWebsite(post).slug);
  const [websiteMarkdown, setWebsiteMarkdown] = useState(() => parseWebsite(post).markdown);

  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);

  const savedChannels: PublishChannel[] =
    post.targetChannels && post.targetChannels.length > 0
      ? post.targetChannels
      : ["website", "linkedin", "newsletter"];

  const channelsModifiedAfterApproval =
    post.status === "approved" && !channelsMatch(selectedChannels, savedChannels);

  const toggleChannel = (channel: PublishChannel) => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );
  };

  // Reviewer Passcode fetch wrapper (sessionStorage cached)
  const fetchWithPasscode = async (url: string, options: RequestInit): Promise<Response> => {
    let headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    const storedCode = typeof window !== "undefined" ? sessionStorage.getItem("reviewer_passcode") : null;
    if (storedCode) {
      headers["x-reviewer-passcode"] = storedCode;
    }

    let res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      const clone = res.clone();
      const body = await clone.json().catch(() => ({}));
      if (typeof body.error === "string" && body.error.toLowerCase().includes("reviewer passcode")) {
        const entered = window.prompt("Authorized Reviewer Passcode Required (will be kept in sessionStorage):");
        if (entered) {
          sessionStorage.setItem("reviewer_passcode", entered.trim());
          headers = {
            ...headers,
            "x-reviewer-passcode": entered.trim(),
          };
          res = await fetch(url, { ...options, headers });
        }
      }
    }
    return res;
  };

  // 1. Save Edits (PATCH)
  const handleSaveChanges = async () => {
    setIsSaving(true);
    setActionMessage(null);

    try {
      const updatedLinkedin: LinkedInPostContent = {
        postText: linkedinText,
        hashtags: linkedinHashtags,
        characterCount: linkedinText.length,
      };

      const updatedNewsletter: NewsletterContent = {
        subject: newsletterSubject,
        previewText: newsletterPreview,
        bodyText: newsletterBody,
        callToAction: newsletterCta,
      };

      const updatedWebsite: WebsiteAnnouncementContent = {
        title: websiteTitle,
        subtitle: websiteSubtitle,
        slug: websiteSlug,
        bodyMarkdown: websiteMarkdown,
        tags: ["Research", "Impact Circles"],
      };

      const res = await fetchWithPasscode(`/api/content/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          linkedinContent: JSON.stringify(updatedLinkedin),
          newsletterContent: JSON.stringify(updatedNewsletter),
          websiteContent: JSON.stringify(updatedWebsite),
          targetChannels: selectedChannels,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save edits.");
      }

      onPostUpdated(data.post);
      if (data.approvalReset) {
        setActionMessage({
          type: "warning",
          text: "Edits saved! Prior approval has been reset — explicit renewed approval is required before publishing.",
        });
      } else {
        setActionMessage({ type: "success", text: "All content revisions saved." });
      }
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Approve or Reject (POST /approve)
  const handleApprove = async () => {
    setIsApproving(true);
    setActionMessage(null);

    try {
      const res = await fetchWithPasscode(`/api/content/${post.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          targetChannels: selectedChannels,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Approval failed.");
      }

      onPostUpdated(data.post);
      setActionMessage({
        type: "success",
        text: "Human approval verified. Ready for automated publishing.",
      });
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Approval failed",
      });
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt("Reason for rejection (optional):", "Revisions needed");
    if (reason === null) return;

    setIsApproving(true);
    setActionMessage(null);

    try {
      const res = await fetchWithPasscode(`/api/content/${post.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          rejectionReason: reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Rejection failed.");
      }

      onPostUpdated(data.post);
      setActionMessage({
        type: "warning",
        text: "Post has been marked as rejected.",
      });
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Rejection failed",
      });
    } finally {
      setIsApproving(false);
    }
  };

  // 3. Automated Publishing (POST /publish)
  const canPublish =
    (post.status === "approved" ||
      post.status === "partially_published" ||
      post.status === "failed") &&
    !channelsModifiedAfterApproval;

  const handlePublish = async () => {
    if (!canPublish) {
      if (channelsModifiedAfterApproval) {
        setActionMessage({
          type: "error",
          text: "Channel selection has changed since approval. The new selection must be saved and approved again before publishing.",
        });
      } else {
        setActionMessage({
          type: "error",
          text: "Content must be explicitly approved by a team member before publishing.",
        });
      }
      return;
    }

    setIsPublishing(true);
    setActionMessage(null);

    try {
      const res = await fetchWithPasscode(`/api/content/${post.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channels: selectedChannels }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Publishing failed.");
      }

      onPostUpdated(data.post);
      setActiveTab("logs");
      const publishedCount =
        data.results?.filter((r: { status: string }) => r.status === "published" || r.status === "success").length || 0;
      const failedCount =
        data.results?.filter((r: { status: string }) => r.status === "failed").length || 0;

      if (failedCount > 0) {
        const failedChannels = data.results
          ?.filter((r: { status: string }) => r.status === "failed")
          .map((r: { channel: string }) => r.channel)
          .join(", ");
        setActionMessage({
          type: "warning",
          text: `Publishing partially completed (${publishedCount} published, ${failedCount} failed on ${failedChannels}). You can retry publishing to dispatch remaining channels.`,
        });
      } else {
        setActionMessage({
          type: "success",
          text: `Published to sandbox across all ${publishedCount} channel(s)! Click the URLs below to view each published record.`,
        });
      }
    } catch (err: unknown) {
      setActionMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Publishing execution failed.",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        );
      case "published":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            Published to Sandbox
          </span>
        );
      case "partially_published":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Partially Published (Sandbox)
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Rejected
          </span>
        );
      case "in_review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Re-approval Needed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Draft
          </span>
        );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl rounded-3xl border border-black/[0.08] bg-white shadow-2xl dark:border-white/[0.08] dark:bg-[#111218] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] p-5 sm:px-6 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <h2 id="modal-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Review & Approve Content Package
            </h2>
            {renderStatusBadge(post.status)}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
            aria-label="Close review modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Action Message Alert */}
        {actionMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-medium border-b flex items-center justify-between ${
              actionMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40"
                : actionMessage.type === "warning"
                ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/40"
                : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800/40"
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Channel Modification Warning for Approved Content */}
        {channelsModifiedAfterApproval && (
          <div className="flex items-center justify-between border-b border-amber-300 bg-amber-50 px-6 py-2.5 text-xs font-medium text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/50 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                <strong>Channel selection modified:</strong> Target channels were changed after approval. You must save edits and obtain renewed approval before publishing.
              </span>
            </div>
            <button
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="ml-3 shrink-0 rounded-lg bg-amber-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-500 cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save Edits"}
            </button>
          </div>
        )}

        {/* Tab Navigation & Target Channels Selector */}
        <div className="flex flex-wrap items-center justify-between border-b border-black/[0.06] px-6 py-2.5 bg-zinc-50/60 dark:border-white/[0.06] dark:bg-zinc-900/40 gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("website")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                activeTab === "website"
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Website Announcement
            </button>
            <button
              onClick={() => setActiveTab("linkedin")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                activeTab === "linkedin"
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              LinkedIn Post
            </button>
            <button
              onClick={() => setActiveTab("newsletter")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                activeTab === "newsletter"
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Newsletter Update
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                activeTab === "logs"
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              Publishing Audit ({post.publishingLogs?.length || 0})
            </button>
          </div>

          {/* Channels Selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Target Channels:</span>
            {channelsModifiedAfterApproval && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Re-approval needed
              </span>
            )}
            <label className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedChannels.includes("website")}
                onChange={() => toggleChannel("website")}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              Web
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedChannels.includes("linkedin")}
                onChange={() => toggleChannel("linkedin")}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              LinkedIn
            </label>
            <label className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedChannels.includes("newsletter")}
                onChange={() => toggleChannel("newsletter")}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              Newsletter
            </label>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Global Package Title */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Package Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs font-semibold text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>
          {/* TAB 1: WEBSITE */}
          {activeTab === "website" && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Article Title
                </label>
                <input
                  type="text"
                  value={websiteTitle}
                  onChange={(e) => setWebsiteTitle(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs font-medium text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Subtitle / Dek
                  </label>
                  <input
                    type="text"
                    value={websiteSubtitle}
                    onChange={(e) => setWebsiteSubtitle(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    URL Slug
                  </label>
                  <input
                    type="text"
                    value={websiteSlug}
                    onChange={(e) => setWebsiteSlug(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs font-mono text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Website Article Body (Markdown)
                </label>
                <textarea
                  rows={10}
                  value={websiteMarkdown}
                  onChange={(e) => setWebsiteMarkdown(e.target.value)}
                  className="w-full font-mono rounded-xl border border-black/[0.1] bg-white p-3 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* TAB 2: LINKEDIN */}
          {activeTab === "linkedin" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  LinkedIn Post Copy
                </label>
                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {linkedinText.length} characters (ideal: 600 - 1,200)
                </span>
              </div>
              <textarea
                rows={9}
                value={linkedinText}
                onChange={(e) => setLinkedinText(e.target.value)}
                className="w-full rounded-xl border border-black/[0.1] bg-white p-3.5 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 leading-relaxed"
              />

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Hashtags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {linkedinHashtags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="rounded-md border border-sky-500/20 bg-sky-50 px-2 py-0.5 font-mono text-[11px] text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NEWSLETTER */}
          {activeTab === "newsletter" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Subject Line
                  </label>
                  <input
                    type="text"
                    value={newsletterSubject}
                    onChange={(e) => setNewsletterSubject(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs font-medium text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                    Preview / Preheader Text
                  </label>
                  <input
                    type="text"
                    value={newsletterPreview}
                    onChange={(e) => setNewsletterPreview(e.target.value)}
                    className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Newsletter Body
                </label>
                <textarea
                  rows={8}
                  value={newsletterBody}
                  onChange={(e) => setNewsletterBody(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-white p-3 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Call to Action (CTA Text / URL)
                </label>
                <input
                  type="text"
                  value={newsletterCta}
                  onChange={(e) => setNewsletterCta(e.target.value)}
                  className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            </div>
          )}

          {/* TAB 4: PUBLISHING LOGS & AUDIT */}
          {activeTab === "logs" && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Automated Publishing Audit Log
              </h3>
              {(!post.publishingLogs || post.publishingLogs.length === 0) ? (
                <div className="rounded-xl border border-black/[0.06] bg-zinc-50/50 p-6 text-center text-xs text-zinc-500 dark:border-white/[0.06] dark:bg-zinc-900/40 dark:text-zinc-400">
                  No automated publishing runs recorded yet. Click &quot;Approve & Publish&quot; below to trigger execution.
                </div>
              ) : (
                <div className="space-y-2">
                  {post.publishingLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl border border-black/[0.06] bg-white p-3.5 shadow-2xs dark:border-white/[0.06] dark:bg-zinc-900/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold uppercase text-xs text-zinc-800 dark:text-zinc-200">
                            {log.channel}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              log.status === "published" || log.status === "success"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                                : log.status === "simulated"
                                ? "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                                : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                            }`}
                          >
                            {log.status === "published"
                              ? "Published (Sandbox)"
                              : log.status === "simulated"
                              ? "Simulated Demo"
                              : log.status}
                          </span>
                        </div>
                        {log.publishedUrl && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <a
                              href={log.publishedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-medium flex items-center gap-1 select-all"
                            >
                              <span>{log.publishedUrl}</span>
                              <span className="text-[10px]">↗</span>
                            </a>
                            <span className="rounded bg-emerald-100/70 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                              Sandbox View
                            </span>
                          </div>
                        )}
                        {log.errorMessage && (
                          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                            Error: {log.errorMessage}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-zinc-400">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-wrap items-center justify-between border-t border-black/[0.06] p-4 sm:px-6 bg-zinc-50 dark:border-white/[0.06] dark:bg-zinc-900/60 gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveChanges}
              disabled={isSaving}
              className="apple-press rounded-xl border border-black/[0.1] bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-800 shadow-2xs hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.1] dark:bg-zinc-800 dark:text-zinc-200 cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save Edits"}
            </button>
            <button
              onClick={handleReject}
              disabled={isApproving}
              className="apple-press rounded-xl border border-rose-500/20 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 cursor-pointer"
            >
              Reject
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {post.status !== "approved" && post.status !== "published" && (
              <button
                onClick={handleApprove}
                disabled={isApproving}
                className="apple-press rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200 cursor-pointer"
              >
                {isApproving ? "Approving..." : "Approve Content"}
              </button>
            )}

            <button
              onClick={handlePublish}
              disabled={isPublishing || !canPublish}
              title={
                !canPublish
                  ? channelsModifiedAfterApproval
                    ? "Channel selection modified: save edits and obtain renewed approval before publishing"
                    : "Content must be explicitly approved before publishing"
                  : post.status === "partially_published" || post.status === "failed"
                  ? "Retry automated sandbox publishing for failed channels"
                  : "Trigger automated sandbox publication"
              }
              className="apple-press flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
            >
              {isPublishing ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Publishing to Sandbox...</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  <span>
                    {post.status === "partially_published" || post.status === "failed"
                      ? "Retry Failed Channels (Sandbox)"
                      : "Publish to Selected Channels (Sandbox)"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
