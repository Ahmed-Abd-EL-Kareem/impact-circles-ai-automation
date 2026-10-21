"use client";

import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import { ExpenseRecord } from "@/lib/types/expense";

interface DocumentUploadZoneProps {
  onUploadSuccess: (expense: ExpenseRecord) => void;
}

export function DocumentUploadZone({ onUploadSuccess }: DocumentUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<number>(0);
  const [stepLabel, setStepLabel] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFile = async (file: File) => {
    setErrorMessage(null);
    setIsProcessing(true);
    setProcessingStep(1);
    setStepLabel("Validating magic bytes (%PDF, PNG, JPEG) & file integrity...");

    // Client-side quick check
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExtensions.includes(ext)) {
      setErrorMessage("Unsupported file format. Please upload a genuine PDF, PNG, or JPEG file.");
      setIsProcessing(false);
      setProcessingStep(0);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(
        `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds the 10 MB limit.`
      );
      setIsProcessing(false);
      setProcessingStep(0);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    // Step 2 progression simulation
    setTimeout(() => {
      setProcessingStep(2);
      setStepLabel("Dispatching to n8n workflow & analyzing with Google Gemini...");
    }, 700);

    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setErrorMessage(data.error || "Document processing failed.");
        setIsProcessing(false);
        setProcessingStep(0);
        return;
      }

      setProcessingStep(3);
      setStepLabel("Validating structured fields & persisting to Neon PostgreSQL...");

      setTimeout(() => {
        setIsProcessing(false);
        setProcessingStep(0);
        onUploadSuccess(data.expense);
      }, 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Network or processing error: ${msg}`);
      setIsProcessing(false);
      setProcessingStep(0);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={`apple-press group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/40 dark:border-emerald-400 dark:bg-emerald-950/20"
            : "border-black/[0.1] bg-gradient-to-b from-zinc-50/50 to-white hover:border-black/20 hover:bg-zinc-50 dark:border-white/[0.1] dark:from-zinc-950/50 dark:to-zinc-900/40 dark:hover:border-white/20 dark:hover:bg-zinc-900/60"
        } ${isProcessing ? "pointer-events-none opacity-85" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={handleFileInputChange}
          className="hidden"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-4 py-3">
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-20" />
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent dark:border-emerald-400 dark:border-t-transparent" />
            </div>

            <div className="space-y-1.5 text-center">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Processing Financial Document
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {stepLabel}
              </p>
            </div>

            {/* Stepper Dots */}
            <div className="flex items-center gap-2 pt-1">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    processingStep >= step
                      ? "w-6 bg-emerald-500"
                      : "w-2 bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100/90 text-zinc-700 shadow-xs transition-transform duration-200 group-hover:scale-105 dark:bg-zinc-800 dark:text-zinc-200">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 underline decoration-emerald-500/30 underline-offset-4 group-hover:decoration-emerald-500">
                  Select a document
                </span>{" "}
                or drag & drop here
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Authentic PDF, PNG, or JPEG • Maximum 10 MB • Instant Multimodal Ingestion
              </p>
            </div>

            {/* Supported format tags */}
            <div className="flex items-center gap-1.5 pt-1">
              {["PDF Document", "PNG Image", "JPEG Image"].map((badge) => (
                <span
                  key={badge}
                  className="rounded-md border border-black/[0.06] bg-zinc-100/80 px-2 py-0.5 font-mono text-[10px] text-zinc-600 dark:border-white/[0.08] dark:bg-zinc-800/60 dark:text-zinc-400"
                >
                  {badge}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error Callout Banner */}
      {errorMessage && (
        <div className="animate-fade-in mt-3.5 flex items-start justify-between gap-3 rounded-xl border border-rose-200/90 bg-rose-50/90 p-4 text-xs text-rose-900 shadow-xs dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-start gap-2.5">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400"
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
            <div>
              <span className="font-semibold">Document Processing Error: </span>
              {errorMessage}
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 cursor-pointer text-sm font-bold"
            title="Dismiss error"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
