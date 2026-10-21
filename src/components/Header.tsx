"use client";

import React from "react";

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  hasError?: boolean;
}

export function Header({ onRefresh, isRefreshing, hasError }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/70 backdrop-blur-xl transition-colors dark:border-white/[0.08] dark:bg-[#090a0f]/80">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Brand & Title */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white shadow-xs dark:from-white dark:to-zinc-200 dark:text-zinc-950">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Impact Circles
              </h1>
              <span className="rounded-md border border-zinc-200/80 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300">
                Phase 2
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-normal">
              Autonomous Financial Document Assistant • Multimodal Extraction
            </p>
          </div>
        </div>

        {/* Architecture Badges & Actions */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {hasError && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              Sync Warning
            </span>
          )}

          {/* Architecture badges (honest telemetry, no fake green dots) */}
          <div className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
            <span>Neon DB / Prisma 7</span>
          </div>

          <div className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
            <span>Gemini Multimodal</span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
            <span>n8n Pipeline</span>
          </div>

          {/* Refresh Action Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh financial records"
            className="apple-press flex items-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-xs hover:border-black/15 hover:bg-zinc-50/80 disabled:opacity-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-zinc-800/80 cursor-pointer"
          >
            <svg
              className={`h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 ${
                isRefreshing ? "animate-spin text-emerald-500" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span className="hidden sm:inline">Refresh Data</span>
          </button>
        </div>
      </div>
    </header>
  );
}
