"use client";

import React, { useState } from "react";
import { ContentKind, ContentPostRecord, PublishChannel } from "@/lib/types/content";

interface ContentGeneratorFormProps {
  onSuccess: (newPost: ContentPostRecord) => void;
}

const SAMPLE_PROMPTS = [
  {
    title: "Clean Water Sensor Milestone",
    type: "project_findings" as ContentKind,
    prompt:
      "Our research circle has completed the 6-month field trial of IoT-enabled solar-powered biosensors in rural water distribution networks across 12 villages. Results indicate a 94.8% detection accuracy for microbial contaminants and a 62% reduction in test turnaround time compared to traditional lab sampling. The project was co-funded by the Clean Earth Alliance.",
  },
  {
    title: "AI Ethics & Policy Workshop",
    type: "event_announcement" as ContentKind,
    prompt:
      "Impact Circles is hosting an international online policy roundtable on 'Ethical Guardrails for Agentic AI in Public Sector Delivery' on November 15, 2026. The summit brings together academic researchers, municipal leaders, and open-source contributors to establish shared accountability standards. Registration is free and open to all.",
  },
  {
    title: "Decentralized Carbon Credit Ledger",
    type: "research_update" as ContentKind,
    prompt:
      "We have published our interim technical report on validating regenerative agriculture carbon offsets using automated satellite multispectral imagery and zero-knowledge verification. Preliminary benchmarks show a 78% reduction in auditing overhead for community farmers.",
  },
];

export function ContentGeneratorForm({ onSuccess }: ContentGeneratorFormProps) {
  const [promptText, setPromptText] = useState("");
  const [contentType, setContentType] = useState<ContentKind>("research_update");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [targetChannels, setTargetChannels] = useState<PublishChannel[]>([
    "website",
    "linkedin",
    "newsletter",
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleChannel = (channel: PublishChannel) => {
    setTargetChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel]
    );
  };

  const handleApplySample = (sample: typeof SAMPLE_PROMPTS[0]) => {
    setPromptText(sample.prompt);
    setContentType(sample.type);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || promptText.trim().length < 10) {
      setError("Please provide a project update of at least 10 characters.");
      return;
    }
    if (targetChannels.length === 0) {
      setError("Please select at least one publishing channel.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptText: promptText.trim(),
          contentType,
          additionalInstructions: additionalInstructions.trim() || undefined,
          targetChannels,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to generate content.");
      }

      onSuccess(data.post);
      setPromptText("");
      setAdditionalInstructions("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Sample Quick-Picks */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Load Sample Update:
        </span>
        {SAMPLE_PROMPTS.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleApplySample(sample)}
            className="apple-press rounded-full border border-black/[0.08] bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-white/[0.08] dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
          >
            {sample.title}
          </button>
        ))}
      </div>

      {/* Main Textarea */}
      <div>
        <label
          htmlFor="prompt-text"
          className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
        >
          Research Project Description / Event Update
        </label>
        <textarea
          id="prompt-text"
          rows={4}
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          placeholder="Paste research findings, key milestone data, outcomes, quotes, or event logistics here..."
          className="w-full rounded-2xl border border-black/[0.1] bg-white p-3.5 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
          disabled={isGenerating}
        />
      </div>

      {/* Configuration Controls Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="content-type"
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Update Type
          </label>
          <select
            id="content-type"
            value={contentType}
            onChange={(e) => setContentType(e.target.value as ContentKind)}
            className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100 cursor-pointer"
            disabled={isGenerating}
          >
            <option value="research_update">Research Progress Update</option>
            <option value="project_findings">Project Findings / Milestone</option>
            <option value="event_announcement">Event or Workshop Announcement</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="instructions"
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Additional Directives (Optional)
          </label>
          <input
            id="instructions"
            type="text"
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder="e.g., Emphasize climate resilience and open collaboration"
            className="w-full rounded-xl border border-black/[0.1] bg-white px-3 py-2 text-xs text-zinc-900 shadow-2xs focus:border-emerald-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-100"
            disabled={isGenerating}
          />
        </div>
      </div>

      {/* Target Channels Selection */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Publishing Channels:
          </span>
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={targetChannels.includes("website")}
              onChange={() => toggleChannel("website")}
              className="rounded text-emerald-600 focus:ring-emerald-500"
              disabled={isGenerating}
            />
            Website Announcement
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={targetChannels.includes("linkedin")}
              onChange={() => toggleChannel("linkedin")}
              className="rounded text-emerald-600 focus:ring-emerald-500"
              disabled={isGenerating}
            />
            LinkedIn Post
          </label>
          <label className="inline-flex items-center gap-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={targetChannels.includes("newsletter")}
              onChange={() => toggleChannel("newsletter")}
              className="rounded text-emerald-600 focus:ring-emerald-500"
              disabled={isGenerating}
            />
            Newsletter Summary
          </label>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isGenerating || !promptText.trim()}
          className="apple-press flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer"
        >
          {isGenerating ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Generating 3 Channels with Gemini...</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Generate Tailored Content</span>
            </>
          )}
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/20 bg-rose-50/80 p-3 text-xs text-rose-800 dark:border-rose-500/25 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {error}
        </div>
      )}
    </form>
  );
}
