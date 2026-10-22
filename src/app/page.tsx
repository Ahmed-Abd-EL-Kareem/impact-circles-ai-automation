"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { SummaryCards } from "@/components/SummaryCards";
import { CategoryBreakdownTable } from "@/components/CategoryBreakdownTable";
import { DocumentUploadZone } from "@/components/DocumentUploadZone";
import { ExpenseTable } from "@/components/ExpenseTable";
import { ValidationIssuesModal } from "@/components/ValidationIssuesModal";
import { ContentAgentView } from "@/components/content/ContentAgentView";
import { ExpenseRecord, FinanceSummaryData } from "@/lib/types/expense";

export default function FinanceDashboardPage() {
  const [activeTab, setActiveTab] = useState<"finance" | "content">("finance");
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal inspection
  const [inspectedExpense, setInspectedExpense] = useState<ExpenseRecord | null>(null);

  // Combined refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setIsLoadingExpenses(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "15");
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (categoryFilter !== "all") params.set("category", categoryFilter);

      const [summaryRes, expensesRes] = await Promise.all([
        fetch("/api/finance/summary"),
        fetch(`/api/invoices?${params.toString()}`),
      ]);

      const [summaryData, expensesData] = await Promise.all([
        summaryRes.json(),
        expensesRes.json(),
      ]);

      if (summaryData.success) {
        setSummary(summaryData.data);
      } else {
        setFetchError(summaryData.error || "Failed to load financial summary.");
      }

      if (expensesData.success) {
        setExpenses(expensesData.data);
        if (expensesData.pagination) {
          setTotalPages(expensesData.pagination.totalPages || 1);
        }
      } else {
        setFetchError(expensesData.error || "Failed to load expense ledger.");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setFetchError(`Connection error: ${msg}`);
    } finally {
      setIsRefreshing(false);
      setIsLoadingExpenses(false);
      setIsLoadingSummary(false);
    }
  }, [currentPage, statusFilter, categoryFilter]);

  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      try {
        const params = new URLSearchParams();
        params.set("page", String(currentPage));
        params.set("limit", "15");
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (categoryFilter !== "all") params.set("category", categoryFilter);

        const [summaryRes, expensesRes] = await Promise.all([
          fetch("/api/finance/summary"),
          fetch(`/api/invoices?${params.toString()}`),
        ]);

        const [summaryData, expensesData] = await Promise.all([
          summaryRes.json(),
          expensesRes.json(),
        ]);

        if (ignore) return;

        if (summaryData.success) {
          setSummary(summaryData.data);
        } else {
          setFetchError(summaryData.error || "Failed to load financial summary.");
        }

        if (expensesData.success) {
          setExpenses(expensesData.data);
          if (expensesData.pagination) {
            setTotalPages(expensesData.pagination.totalPages || 1);
          }
        } else {
          setFetchError(expensesData.error || "Failed to load expense ledger.");
        }
      } catch (e) {
        if (!ignore) {
          const msg = e instanceof Error ? e.message : "Network error";
          setFetchError(`Connection error: ${msg}`);
        }
      } finally {
        if (!ignore) {
          setIsLoadingExpenses(false);
          setIsLoadingSummary(false);
        }
      }
    }

    loadInitialData();

    return () => {
      ignore = true;
    };
  }, [currentPage, statusFilter, categoryFilter]);

  // When an upload succeeds
  const handleUploadSuccess = (newExpense: ExpenseRecord) => {
    handleRefresh();
    setInspectedExpense(newExpense);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans text-zinc-900 antialiased dark:bg-[#090a0f] dark:text-zinc-100 selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300">
      <Header
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        hasError={!!fetchError}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {activeTab === "content" ? (
          <ContentAgentView />
        ) : (
          <>
            {/* Error Alert Banner */}
            {fetchError && (
              <div
                role="alert"
                className="flex items-center justify-between rounded-2xl border border-rose-500/20 bg-rose-50/80 p-4 text-xs font-medium text-rose-800 shadow-xs dark:border-rose-500/25 dark:bg-rose-950/40 dark:text-rose-200"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{fetchError}</span>
                </div>
                <button
                  onClick={handleRefresh}
                  className="apple-press rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-200 dark:bg-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-800 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Top Summary Banner */}
            <section aria-labelledby="summary-heading" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 id="summary-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Executive Telemetry & Financial Health
                </h2>
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                  Live Neon Aggregation
                </span>
              </div>
              <SummaryCards summary={summary} isLoading={isLoadingSummary} />
              <CategoryBreakdownTable data={summary?.byCategoryAndCurrency} isLoading={isLoadingSummary} />
            </section>

            {/* Upload Document Section */}
            <section
              aria-labelledby="upload-heading"
              className="rounded-3xl border border-black/[0.08] bg-white/80 backdrop-blur-xl p-6 sm:p-7 shadow-xs dark:border-white/[0.08] dark:bg-zinc-900/60"
            >
              <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h2
                    id="upload-heading"
                    className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                  >
                    Financial Document Ingestion
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    Single-owner ingestion orchestrated by local n8n workflow, parsed by Google Gemini, verified against database duplicates.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-zinc-50 px-2.5 py-1 font-mono text-[11px] text-zinc-600 dark:border-white/[0.06] dark:bg-zinc-800 dark:text-zinc-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Zero Hallucination Contract
                  </span>
                </div>
              </div>
              <DocumentUploadZone onUploadSuccess={handleUploadSuccess} />
            </section>

            {/* Expenses List & Inspection Table */}
            <section aria-labelledby="expenses-heading" className="space-y-3">
              <ExpenseTable
                expenses={expenses}
                isLoading={isLoadingExpenses}
                selectedStatus={statusFilter}
                onStatusChange={(status) => {
                  setStatusFilter(status);
                  setCurrentPage(1);
                }}
                selectedCategory={categoryFilter}
                onCategoryChange={(cat) => {
                  setCategoryFilter(cat);
                  setCurrentPage(1);
                }}
                onInspect={(exp) => setInspectedExpense(exp)}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(p) => setCurrentPage(p)}
              />
            </section>
          </>
        )}
      </main>

      {/* Inspection Modal Sheet */}
      <ValidationIssuesModal
        expense={inspectedExpense}
        onClose={() => setInspectedExpense(null)}
      />
    </div>
  );
}
