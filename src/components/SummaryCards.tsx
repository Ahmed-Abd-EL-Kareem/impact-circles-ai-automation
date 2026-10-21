import React from "react";
import { FinanceSummaryData } from "@/lib/types/expense";

interface SummaryCardsProps {
  summary: FinanceSummaryData | null;
  isLoading: boolean;
}

export function SummaryCards({ summary, isLoading }: SummaryCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-2xl border border-black/[0.05] bg-zinc-100/70 dark:border-white/[0.05] dark:bg-zinc-900/40"
          />
        ))}
      </div>
    );
  }

  const total = summary?.totalExpenses ?? 0;
  const needsReview = summary?.needsReviewCount ?? 0;
  const duplicates = summary?.duplicateSuspectedCount ?? 0;
  const byCurrency = summary?.byCurrency ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Total Documents Ingested */}
      <div className="group relative overflow-hidden rounded-2xl border border-black/[0.07] bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-black/15 dark:border-white/[0.08] dark:bg-zinc-900/70 dark:hover:border-white/15">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Ingested Records
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:bg-zinc-700">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </span>
        </div>
        <div className="mt-3.5 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tracking-tight text-zinc-900 tabular-nums dark:text-zinc-50">
            {total}
          </span>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            total entries
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Synchronized with Neon PostgreSQL</span>
        </div>
      </div>

      {/* 2. Needs Review */}
      <div className="group relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-b from-amber-50/50 to-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-amber-300 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-zinc-900/70 dark:hover:border-amber-800/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Needs Review
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100/80 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </span>
        </div>
        <div className="mt-3.5 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tracking-tight text-amber-900 tabular-nums dark:text-amber-200">
            {needsReview}
          </span>
          <span className="text-xs font-medium text-amber-700/80 dark:text-amber-400/80">
            anomalies or missing values
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span>Flagged for human verification</span>
        </div>
      </div>

      {/* 3. Suspected Duplicates */}
      <div className="group relative overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-b from-rose-50/50 to-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-rose-300 dark:border-rose-900/40 dark:from-rose-950/20 dark:to-zinc-900/70 dark:hover:border-rose-800/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-rose-800 dark:text-rose-300">
            Duplicate Candidates
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100/80 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
              />
            </svg>
          </span>
        </div>
        <div className="mt-3.5 flex items-baseline gap-2">
          <span className="font-mono text-3xl font-bold tracking-tight text-rose-900 tabular-nums dark:text-rose-200">
            {duplicates}
          </span>
          <span className="text-xs font-medium text-rose-700/80 dark:text-rose-400/80">
            potential collisions
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-rose-700/80 dark:text-rose-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          <span>Vendor + invoice + amount match</span>
        </div>
      </div>

      {/* 4. Ledger Volumes By Currency (Strict Isolation) */}
      <div className="group relative overflow-hidden rounded-2xl border border-black/[0.07] bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-black/15 dark:border-white/[0.08] dark:bg-zinc-900/70 dark:hover:border-white/15">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Currency Volumes
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100/70 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </span>
        </div>

        <div className="mt-3 space-y-1.5 max-h-20 overflow-y-auto pr-0.5">
          {byCurrency.length === 0 ? (
            <div className="text-xs text-zinc-400 dark:text-zinc-500 italic py-1">
              No currencies recorded yet
            </div>
          ) : (
            byCurrency.map((item) => (
              <div
                key={item.currency}
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-2.5 py-1 text-xs dark:bg-zinc-800/50"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    {item.currency}
                  </span>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    ({item.count})
                  </span>
                </div>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {item.totalAmount}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
