"use client";

import React, { useEffect } from "react";
import { ExpenseRecord } from "@/lib/types/expense";

interface ValidationIssuesModalProps {
  expense: ExpenseRecord | null;
  onClose: () => void;
}

export function ValidationIssuesModal({
  expense,
  onClose,
}: ValidationIssuesModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!expense) return null;

  const issues = expense.validationIssues || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 animate-fade-in dark:bg-black/70"
    >
      <div className="animate-scale-in relative w-full max-w-xl rounded-3xl border border-black/[0.08] bg-white p-6 shadow-2xl dark:border-white/[0.1] dark:bg-[#11131a]">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-black/[0.06] pb-4 dark:border-white/[0.06]">
          <div>
            <div className="flex items-center gap-2">
              <h3
                id="modal-title"
                className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
              >
                Extraction Telemetry & Audit
              </h3>
              <span className="rounded-md border border-black/[0.06] bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:border-white/[0.08] dark:bg-zinc-800 dark:text-zinc-400">
                {expense.sourceFileName}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              Record ID: {expense.id}
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="apple-press rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Callout Bar */}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-50/80 p-3.5 border border-black/[0.04] dark:bg-zinc-800/40 dark:border-white/[0.04]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Integrity Status:
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                expense.validationStatus === "valid"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                  : expense.validationStatus === "needs_review"
                  ? "bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/25"
                  : expense.validationStatus === "duplicate_suspected"
                  ? "bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-500/25"
                  : "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border border-zinc-500/25"
              }`}
            >
              {expense.validationStatus.replace("_", " ")}
            </span>
          </div>

          <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {new Date(expense.createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {/* Extracted Fields Matrix */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-black/[0.06] bg-zinc-50/40 p-4 text-xs dark:border-white/[0.06] dark:bg-zinc-900/40">
          <div>
            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Vendor
            </div>
            <div className="mt-0.5 font-semibold text-zinc-900 dark:text-zinc-100">
              {expense.vendor || <span className="italic text-zinc-400">Not detected</span>}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Invoice #
            </div>
            <div className="mt-0.5 font-mono font-medium text-zinc-800 dark:text-zinc-200">
              {expense.invoiceNumber || <span className="italic text-zinc-400">Not detected</span>}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Expense Date
            </div>
            <div className="mt-0.5 font-mono text-zinc-800 dark:text-zinc-200">
              {expense.expenseDate || <span className="italic text-zinc-400">Not detected</span>}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Category
            </div>
            <div className="mt-0.5 font-medium capitalize text-zinc-800 dark:text-zinc-200">
              {expense.category}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Grand Total
            </div>
            <div className="mt-0.5 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {expense.currency ? `${expense.currency} ` : ""}
              {expense.amount !== null ? expense.amount : "—"}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
              Recorded Tax
            </div>
            <div className="mt-0.5 font-mono font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">
              {expense.taxAmount !== null ? `${expense.currency || ""} ${expense.taxAmount}` : "—"}
            </div>
          </div>

          {expense.subtotalAmount && (
            <div>
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Pre-Tax Subtotal
              </div>
              <div className="mt-0.5 font-mono font-medium text-zinc-700 dark:text-zinc-300 tabular-nums">
                {expense.currency ? `${expense.currency} ` : ""}{expense.subtotalAmount}
              </div>
            </div>
          )}

          {expense.idempotencyKey && (
            <div>
              <div className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Idempotency Key
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-400 truncate">
                {expense.idempotencyKey}
              </div>
            </div>
          )}
        </div>

        {/* Validation Issues / Audit Log */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Audit Findings ({issues.length})
            </h4>
            {issues.length > 0 && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                Rule-based discrepancy engine
              </span>
            )}
          </div>

          <div className="mt-2.5 max-h-44 space-y-2 overflow-y-auto pr-1">
            {issues.length === 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
                <svg className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Full integrity: All required fields were extracted with high confidence.</span>
              </div>
            ) : (
              issues.map((issue, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed ${
                    issue.severity === "error"
                      ? "border-rose-200/80 bg-rose-50/70 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
                      : "border-amber-200/80 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                  }`}
                >
                  <span className="mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider bg-black/[0.06] dark:bg-white/[0.08]">
                    {issue.code}
                  </span>
                  <div className="flex-1">
                    <p>{issue.message}</p>
                    {issue.field && (
                      <span className="mt-1 inline-block text-[10px] text-zinc-500 dark:text-zinc-400">
                        Affected field: <span className="font-mono font-medium">{issue.field}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="apple-press rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
