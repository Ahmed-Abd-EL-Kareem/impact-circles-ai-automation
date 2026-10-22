import React from "react";
import { CategoryCurrencySummary } from "@/lib/types/expense";

interface CategoryBreakdownTableProps {
  data: CategoryCurrencySummary[] | undefined;
  isLoading?: boolean;
}

export function CategoryBreakdownTable({ data, isLoading }: CategoryBreakdownTableProps) {
  if (isLoading) {
    return (
      <div className="h-44 animate-pulse rounded-2xl border border-black/[0.05] bg-zinc-100/70 dark:border-white/[0.05] dark:bg-zinc-900/40" />
    );
  }

  const items = data || [];

  return (
    <div className="rounded-2xl border border-black/[0.08] bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Category × Currency Breakdown
          </h3>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Aggregated volumes strictly grouped by category and currency code (zero cross-currency addition).
          </p>
        </div>
        <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40 self-start sm:self-auto">
          {items.length} Category Group(s)
        </span>
      </div>

      {items.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-500 italic">
          No categorized currency totals recorded yet. Ingest documents to view financial distribution.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-black/[0.06] text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:border-white/[0.06] dark:text-zinc-500">
                <th className="pb-2.5 font-medium">Category</th>
                <th className="pb-2.5 font-medium">Currency</th>
                <th className="pb-2.5 font-medium text-right">Documents</th>
                <th className="pb-2.5 font-medium text-right">Total Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {items.map((row, idx) => (
                <tr
                  key={`${row.category}-${row.currency}-${idx}`}
                  className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="py-2.5 font-medium capitalize text-zinc-800 dark:text-zinc-200">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
                      {row.category}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">
                      {row.currency}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {row.count}
                  </td>
                  <td className="py-2.5 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {row.totalAmount} {row.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
