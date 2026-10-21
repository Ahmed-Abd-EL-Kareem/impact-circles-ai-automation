"use client";

import React from "react";
import { ExpenseRecord, ValidationStatus } from "@/lib/types/expense";

interface ExpenseTableProps {
  expenses: ExpenseRecord[];
  isLoading: boolean;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onInspect: (expense: ExpenseRecord) => void;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function ExpenseTable({
  expenses,
  isLoading,
  selectedStatus,
  onStatusChange,
  selectedCategory,
  onCategoryChange,
  onInspect,
  currentPage,
  totalPages,
  onPageChange,
}: ExpenseTableProps) {
  const getStatusBadge = (status: ValidationStatus) => {
    switch (status) {
      case "valid":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Valid
          </span>
        );
      case "needs_review":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Needs Review
          </span>
        );
      case "duplicate_suspected":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 dark:text-rose-300">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Duplicate Flag
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-500/25 bg-zinc-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
            Failed
          </span>
        );
    }
  };

  const statusTabs = [
    { key: "all", label: "All Records" },
    { key: "valid", label: "Valid" },
    { key: "needs_review", label: "Needs Review" },
    { key: "duplicate_suspected", label: "Duplicates" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-xs transition-colors dark:border-white/[0.08] dark:bg-zinc-900/60">
      {/* Table Toolbar & Segmented Status Filters */}
      <div className="flex flex-col gap-4 border-b border-black/[0.06] p-4.5 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Ledger & Extraction Registry
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Persisted financial documents with extraction telemetry and validation audit
          </p>
        </div>

        {/* Status segmented buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-xl border border-black/[0.06] bg-zinc-100/70 p-1 dark:border-white/[0.06] dark:bg-zinc-800/60">
            {statusTabs.map((tab) => {
              const isActive = selectedStatus === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => onStatusChange(tab.key)}
                  className={`apple-press rounded-lg px-2.5 py-1 text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-white text-zinc-900 shadow-2xs dark:bg-zinc-900 dark:text-zinc-50"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Category dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="rounded-xl border border-black/[0.08] bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none hover:border-black/20 focus:border-emerald-500 dark:border-white/[0.08] dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-white/20 dark:focus:border-emerald-400 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="software">Software</option>
            <option value="equipment">Equipment</option>
            <option value="operational">Operational</option>
            <option value="travel">Travel</option>
            <option value="events">Events</option>
            <option value="personnel">Personnel</option>
            <option value="uncategorized">Uncategorized</option>
          </select>
        </div>
      </div>

      {/* Table Data or Empty State */}
      {isLoading ? (
        <div className="py-20 text-center">
          <div className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Loading ledger records...</p>
        </div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-black/[0.05] bg-zinc-50 text-zinc-400 shadow-2xs dark:border-white/[0.05] dark:bg-zinc-800/50 dark:text-zinc-500">
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="mt-3.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No Expense Records Found
          </h3>
          <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Upload an authentic receipt or invoice above to trigger the n8n pipeline, Gemini structured extraction, and Neon database persistence.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-black/[0.05] bg-zinc-50/70 font-medium text-zinc-500 dark:border-white/[0.05] dark:bg-zinc-800/30 dark:text-zinc-400">
              <tr>
                <th className="py-3 px-4 font-medium">Date</th>
                <th className="py-3 px-4 font-medium">Vendor</th>
                <th className="py-3 px-4 font-medium">Invoice #</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 text-right font-medium">Amount</th>
                <th className="py-3 px-4 text-right font-medium">Tax</th>
                <th className="py-3 px-4 text-center font-medium">Status</th>
                <th className="py-3 px-4 text-right font-medium">Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
              {expenses.map((expense) => {
                const issuesCount = expense.validationIssues?.length || 0;
                return (
                  <tr
                    key={expense.id}
                    className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    {/* Date */}
                    <td className="py-3.5 px-4 font-mono text-zinc-600 tabular-nums dark:text-zinc-400">
                      {expense.expenseDate || (
                        <span className="italic text-zinc-400 dark:text-zinc-600">Missing</span>
                      )}
                    </td>

                    {/* Vendor */}
                    <td className="py-3.5 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                      {expense.vendor || (
                        <span className="italic text-zinc-400 dark:text-zinc-600">Unidentified</span>
                      )}
                    </td>

                    {/* Invoice # */}
                    <td className="py-3.5 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                      {expense.invoiceNumber || (
                        <span className="italic text-zinc-400 dark:text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-4">
                      <span className="inline-block rounded-md border border-black/[0.06] bg-zinc-100 px-2 py-0.5 text-[11px] font-medium capitalize text-zinc-700 dark:border-white/[0.06] dark:bg-zinc-800 dark:text-zinc-300">
                        {expense.category}
                      </span>
                    </td>

                    {/* Amount & Currency */}
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-zinc-900 tabular-nums dark:text-zinc-50">
                      {expense.amount !== null ? (
                        <>
                          <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 mr-1">
                            {expense.currency || ""}
                          </span>
                          {expense.amount}
                        </>
                      ) : (
                        <span className="italic text-zinc-400">Missing</span>
                      )}
                    </td>

                    {/* Tax */}
                    <td className="py-3.5 px-4 text-right font-mono text-zinc-500 tabular-nums dark:text-zinc-400">
                      {expense.taxAmount !== null ? expense.taxAmount : "—"}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(expense.validationStatus)}
                    </td>

                    {/* Actions / Inspection Button */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onInspect(expense)}
                        className={`apple-press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors ${
                          issuesCount > 0
                            ? "border border-amber-500/25 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
                            : "border border-black/[0.08] bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-white/[0.08] dark:bg-zinc-800/60 dark:text-zinc-300 dark:hover:bg-zinc-700"
                        }`}
                      >
                        <span>Inspect</span>
                        {issuesCount > 0 && (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] font-bold text-amber-900 dark:text-amber-200">
                            {issuesCount}
                          </span>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-3 text-xs dark:border-white/[0.06]">
          <span className="text-zinc-500 dark:text-zinc-400">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="apple-press rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 disabled:opacity-40 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="apple-press rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 disabled:opacity-40 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-zinc-800 dark:hover:bg-zinc-700 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
