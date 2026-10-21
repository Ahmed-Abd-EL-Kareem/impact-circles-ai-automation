"use client";

import React, { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { SummaryCards } from "@/components/SummaryCards";
import { DocumentUploadZone } from "@/components/DocumentUploadZone";
import { ExpenseTable } from "@/components/ExpenseTable";
import { ValidationIssuesModal } from "@/components/ValidationIssuesModal";
import { ExpenseRecord, FinanceSummaryData } from "@/lib/types/expense";

export default function FinanceDashboardPage() {
  const [summary, setSummary] = useState<FinanceSummaryData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal inspection
  const [inspectedExpense, setInspectedExpense] = useState<ExpenseRecord | null>(null);

  // Combined refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setIsLoadingExpenses(true);
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

      if (summaryData.success) setSummary(summaryData.data);
      if (expensesData.success) {
        setExpenses(expensesData.data);
        if (expensesData.pagination) {
          setTotalPages(expensesData.pagination.totalPages || 1);
        }
      }
    } catch (e) {
      console.error("Refresh failed:", e);
    } finally {
      setIsRefreshing(false);
      setIsLoadingExpenses(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch("/api/finance/summary")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setSummary(data.data);
        }
      })
      .catch((err) => console.error("Failed to load summary:", err))
      .finally(() => {
        if (isMounted) setIsLoadingSummary(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", "15");
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    fetch(`/api/invoices?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setExpenses(data.data);
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages || 1);
          }
        }
      })
      .catch((err) => console.error("Failed to load expenses:", err))
      .finally(() => {
        if (isMounted) setIsLoadingExpenses(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentPage, statusFilter, categoryFilter]);

  // When an upload succeeds
  const handleUploadSuccess = (newExpense: ExpenseRecord) => {
    handleRefresh();
    setInspectedExpense(newExpense);
  };

  return (
    <div className="min-h-screen bg-slate-50/70 font-sans text-zinc-900 antialiased dark:bg-[#090a0f] dark:text-zinc-100 selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300">
      <Header onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Top Summary Banner */}
        <section aria-labelledby="summary-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="summary-heading" className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Executive Telemetry & Financial Health
            </h2>
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
              Live Neon Aggregation
            </span>
          </div>
          <SummaryCards summary={summary} isLoading={isLoadingSummary} />
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
      </main>

      {/* Inspection Modal Sheet */}
      <ValidationIssuesModal
        expense={inspectedExpense}
        onClose={() => setInspectedExpense(null)}
      />
    </div>
  );
}
