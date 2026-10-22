"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

interface SandboxRefreshControlProps {
  initialCount: number;
}

export function SandboxRefreshControl({ initialCount }: SandboxRefreshControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastRefreshed, setLastRefreshed] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );
  const [autoRefresh, setAutoRefresh] = useState(true);

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
      setLastRefreshed(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    });
  };

  // Auto-refresh interval (every 4 seconds) to detect new publications in real time
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh();
        setLastRefreshed(
          new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        );
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <span>Auto-refresh (4s)</span>
        </label>
        {autoRefresh && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        )}
      </div>

      <button
        onClick={handleRefresh}
        disabled={isPending}
        className="apple-press flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
        title="Force fetch latest sandbox publications"
      >
        <svg
          className={`h-3.5 w-3.5 ${isPending ? "animate-spin text-emerald-600" : "text-zinc-500"}`}
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
        <span>{isPending ? "Refreshing..." : "Refresh"}</span>
      </button>

      <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
        Updated {lastRefreshed}
      </span>

      <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">
        {initialCount} publication{initialCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}
