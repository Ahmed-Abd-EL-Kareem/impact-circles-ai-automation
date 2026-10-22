import fs from "node:fs";
import path from "node:path";
import type { FinanceSummaryData, ExpenseRecord } from "../src/lib/types/expense.ts";
import type { ContentPostRecord, PublishingLogRecord } from "../src/lib/types/content.ts";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = typeof val === "string" ? val : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function generateSampleOutputs() {
  const outDir = path.join(process.cwd(), "sample-outputs");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log("Generating sample deliverables to sample-outputs/...\n");

  const now = new Date("2026-03-20T12:00:00.000Z");

  // 1. Fictional sample expenses representing the 3 fixtures:
  // - 1 valid invoice (Acme Cloud Hosting, USD)
  // - 1 duplicate invoice (same vendor + invoiceNumber + amount + currency)
  // - 1 missing-fields receipt (Local Hardware Mart, EUR, missing invoice number, date, tax)
  const sampleExpenses: ExpenseRecord[] = [
    {
      id: "exp_sample_valid_001",
      idempotencyKey: "idem_sample_acme_001",
      expenseDate: "2026-03-20",
      vendor: "Acme Cloud Hosting Inc.",
      invoiceNumber: "INV-2026-9012",
      description: "Cloud Server Hosting Cluster",
      subtotalAmount: "150.00",
      amount: "165.00",
      currency: "USD",
      taxAmount: "15.00",
      category: "software",
      validationStatus: "valid",
      validationIssues: [],
      sourceFileName: "fictional-invoice.pdf",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "exp_sample_duplicate_002",
      idempotencyKey: "idem_sample_acme_002",
      expenseDate: "2026-03-20",
      vendor: "Acme Cloud Hosting Inc.",
      invoiceNumber: "INV-2026-9012",
      description: "Cloud Server Hosting Cluster (Duplicate Submission)",
      subtotalAmount: "150.00",
      amount: "165.00",
      currency: "USD",
      taxAmount: "15.00",
      category: "software",
      validationStatus: "duplicate_suspected",
      validationIssues: [
        {
          code: "duplicate_suspected",
          severity: "warning",
          message:
            "Matching record found with identical vendor, invoice number, amount, and currency (Candidate ID: exp_sample_valid_001).",
          field: "invoiceNumber",
        },
      ],
      sourceFileName: "fictional-duplicate-invoice.pdf",
      createdAt: new Date(now.getTime() + 15 * 60000).toISOString(),
      updatedAt: new Date(now.getTime() + 15 * 60000).toISOString(),
    },
    {
      id: "exp_sample_missing_003",
      idempotencyKey: "idem_sample_hardware_003",
      expenseDate: null,
      vendor: "Local Hardware Mart",
      invoiceNumber: null,
      description: "Sensor mounting brackets",
      subtotalAmount: null,
      amount: "85.00",
      currency: "EUR",
      taxAmount: null,
      category: "equipment",
      validationStatus: "needs_review",
      validationIssues: [
        {
          code: "missing_invoice_number",
          severity: "warning",
          message: "Document does not specify a valid invoice identifier.",
          field: "invoiceNumber",
        },
        {
          code: "missing_expense_date",
          severity: "warning",
          message: "Document date could not be determined from extraction.",
          field: "expenseDate",
        },
        {
          code: "missing_subtotal",
          severity: "warning",
          message: "Pre-tax subtotal amount is missing.",
          field: "subtotalAmount",
        },
      ],
      sourceFileName: "fictional-missing-fields-invoice.pdf",
      createdAt: new Date(now.getTime() + 30 * 60000).toISOString(),
      updatedAt: new Date(now.getTime() + 30 * 60000).toISOString(),
    },
  ];

  // 1. Export expenses.csv
  const csvHeaders = [
    "ID",
    "Date",
    "Vendor",
    "Invoice Number",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Subtotal",
    "Tax",
    "Validation Status",
    "Validation Issues Count",
    "Source File Name",
    "Created At",
  ];

  const csvRows = sampleExpenses.map((e) =>
    [
      escapeCsvField(e.id),
      escapeCsvField(e.expenseDate || ""),
      escapeCsvField(e.vendor || ""),
      escapeCsvField(e.invoiceNumber || ""),
      escapeCsvField(e.description || ""),
      escapeCsvField(e.category),
      escapeCsvField(e.amount || ""),
      escapeCsvField(e.currency || ""),
      escapeCsvField(e.subtotalAmount || ""),
      escapeCsvField(e.taxAmount || ""),
      escapeCsvField(e.validationStatus),
      escapeCsvField(e.validationIssues.length),
      escapeCsvField(e.sourceFileName),
      escapeCsvField(e.createdAt),
    ].join(",")
  );

  const csvContent = [csvHeaders.join(","), ...csvRows].join("\r\n");
  fs.writeFileSync(path.join(outDir, "expenses.csv"), csvContent, "utf-8");
  console.log("✓ Wrote sample-outputs/expenses.csv");

  // 2. Export finance-summary.json
  const financeSummary: FinanceSummaryData = {
    totalExpenses: 3,
    validCount: 1,
    needsReviewCount: 2, // duplicate_suspected (1) + needs_review (1)
    duplicateSuspectedCount: 1,
    byCurrency: [
      { currency: "USD", count: 2, totalAmount: "330.00" },
      { currency: "EUR", count: 1, totalAmount: "85.00" },
    ],
    byCategory: [
      { category: "software", count: 2 },
      { category: "equipment", count: 1 },
    ],
    byCategoryAndCurrency: [
      { category: "equipment", currency: "EUR", count: 1, totalAmount: "85.00" },
      { category: "software", currency: "USD", count: 2, totalAmount: "330.00" },
    ],
  };

  fs.writeFileSync(
    path.join(outDir, "finance-summary.json"),
    JSON.stringify(financeSummary, null, 2),
    "utf-8"
  );
  console.log("✓ Wrote sample-outputs/finance-summary.json");

  // 3. Export finance-summary.md
  const markdownSummary = `# Financial Document Assistant — Executive Summary

**Generated At**: 2026-03-20 12:45:00 UTC  
**Environment**: Impact Circles AI Automation Sandbox  

---

## 1. High-Level Metrics

| Metric | Value | Status |
| :--- | :--- | :--- |
| **Total Ingested Documents** | **3** | Persisted in Neon PostgreSQL |
| **Verified & Arithmetic-Valid** | **1** (33.3%) | Ready for reconciliation |
| **Pending Review / Anomalies** | **2** (66.7%) | Flagged for human verification |
| **Suspected Duplicates** | **1** (33.3%) | Collided on vendor + invoiceNumber + amount |

---

## 2. Currency Grouping & Volumes (Strict Isolation)

> **Financial Invariant**: Currency totals are computed strictly per ISO 4217 currency code. Zero cross-currency addition is permitted without verified real-time foreign exchange rates.

| Currency Code | Processed Entries | Total Ledger Volume | Arithmetic Drift |
| :--- | :--- | :--- | :--- |
| **USD** | 2 entries | **$330.00 USD** | $0.00 |
| **EUR** | 1 entry | **€85.00 EUR** | €0.00 |

---

## 3. Category × Currency Breakdown

| Category | Currency | Document Count | Total Amount |
| :--- | :--- | :--- | :--- |
| **Software** | USD | 2 | **$330.00 USD** |
| **Equipment** | EUR | 1 | **€85.00 EUR** |

---

## 4. Anomaly Inspection & Audit Log

| Document ID | Vendor | Status | Flagged Issues |
| :--- | :--- | :--- | :--- |
| \`exp_sample_valid_001\` | Acme Cloud Hosting Inc. | \`valid\` | None (Reconciled: subtotal \$150 + tax \$15 = \$165) |
| \`exp_sample_duplicate_002\` | Acme Cloud Hosting Inc. | \`duplicate_suspected\` | Duplicate collision with prior record \`exp_sample_valid_001\` |
| \`exp_sample_missing_003\` | Local Hardware Mart | \`needs_review\` | Missing invoice identifier, missing date, missing pre-tax subtotal |
`;

  fs.writeFileSync(path.join(outDir, "finance-summary.md"), markdownSummary, "utf-8");
  console.log("✓ Wrote sample-outputs/finance-summary.md");

  // 4. Export generated-content.json (one full 3-channel package)
  const contentPackage: ContentPostRecord = {
    id: "post_sample_agro_001",
    title: "Interim Milestone: Satellite Multispectral Verification for Regenerative Agriculture",
    sourcePrompt:
      "We completed our interim field trial across 12 community farm clusters in the Nile Delta, verifying soil carbon sequestration via automated Sentinel-2 multispectral indexing and zero-knowledge ledger attestation. Preliminary benchmarks show a 78% reduction in auditing overhead and 100% compliance across partner cooperatives.",
    contentType: "research_update",
    status: "published",
    targetChannels: ["website", "linkedin", "newsletter"],
    websiteContent: JSON.stringify({
      title: "Interim Milestone: Satellite Multispectral Verification for Regenerative Agriculture",
      subtitle: "78% auditing overhead reduction achieved across 12 community farm clusters in the Nile Delta.",
      slug: "satellite-multispectral-verification-regenerative-agriculture",
      tags: ["RegenerativeAgriculture", "RemoteSensing", "CarbonVerification", "ImpactCircles"],
      bodyMarkdown: `## Executive Overview

Impact Circles has concluded its 6-month field trial across **12 agricultural cooperatives in the Nile Delta**, establishing automated verification of regenerative farming practices through high-resolution satellite remote sensing.

### Key Performance Benchmarks
- **78% Reduction in Audit Overhead**: Replaced manual agronomist site-visit sampling with automated multispectral soil-organic-carbon (SOC) density modeling.
- **Sentinel-2 Harmonization**: Real-time NDVI, NDRE, and Moisture Stress Index synthesis cross-referenced with ground truth IoT capacitance probes.
- **Immutable Attestation**: Soil health benchmarks cryptographically committed to ensure fraud-resistant environmental credits.

### Next Steps
Field expansion into Upper Egypt beginning in Q3 2026, scaling from 12 to 60 participating cooperative clusters.`,
    }),
    linkedinContent: JSON.stringify({
      postText: `🛰️ Major milestone in regenerative agriculture verification!

We're proud to publish the interim results of our field trial across 12 community farming cooperatives in the Nile Delta. By combining automated Sentinel-2 satellite multispectral indexing with cryptographic data attestation, our team achieved:

✅ 78% reduction in auditing overhead compared to legacy manual sampling
✅ Continuous vegetative index (NDVI & NDRE) monitoring across 4,200 hectares
✅ 100% verified compliance for soil organic carbon benchmarks

Automation and accessible AI can democratize carbon credit access for smallholder farmers. Full research breakdown and open methodologies available on our website.`,
      hashtags: ["#RegenerativeAgriculture", "#AgTech", "#SatelliteData", "#ImpactCircles", "#ClimateAction"],
      characterCount: 684,
    }),
    newsletterContent: JSON.stringify({
      subject: "Field Report: 78% Lower Auditing Costs for Smallholder Regenerative Farming",
      previewText: "How satellite multispectral indexing is validating carbon credits in the Nile Delta.",
      bodyText: `Dear Community,

We are thrilled to share interim results from our flagship regenerative agriculture automation program. Over the last six months, Impact Circles has partnered with 12 local farming cooperatives in the Nile Delta to demonstrate that remote sensing and AI can dramatically lower the barriers to verified carbon offset certification.

Traditional auditing requires expensive agronomist site visits, often consuming up to 35% of total carbon credit revenues. Our automated pipeline synthesizes ESA Sentinel-2 multispectral bands with local ground-truth sensors, cutting auditing overhead by 78% while providing tamper-evident verification.

Read the full technical brief, download the open benchmark dataset, and explore the interactive sandbox demo below.`,
      callToAction: "Read Full Research Brief",
    }),
    metadata: {
      model: "gemini-flash-latest",
      wordCount: 312,
      generationLatencyMs: 1420,
    },
    approvedAt: "2026-03-20T13:00:00.000Z",
    publishedAt: "2026-03-20T13:05:00.000Z",
    createdAt: "2026-03-20T12:50:00.000Z",
    updatedAt: "2026-03-20T13:05:00.000Z",
  };

  fs.writeFileSync(
    path.join(outDir, "generated-content.json"),
    JSON.stringify(contentPackage, null, 2),
    "utf-8"
  );
  console.log("✓ Wrote sample-outputs/generated-content.json");

  // 5. Export publication-log.json
  const publicationLogs: PublishingLogRecord[] = [
    {
      id: "log_sample_web_001",
      postId: "post_sample_agro_001",
      channel: "website",
      status: "published",
      publishedUrl:
        "http://localhost:3000/sandbox/news/satellite-multispectral-verification-regenerative-agriculture",
      responsePayload: {
        id: "pub_sample_web_001",
        link: "http://localhost:3000/sandbox/news/satellite-multispectral-verification-regenerative-agriculture",
        status: "publish",
        slug: "satellite-multispectral-verification-regenerative-agriculture",
        target: "WordPress REST API (Simulated Sandbox Destination)",
      },
      errorMessage: null,
      createdAt: "2026-03-20T13:05:01.000Z",
    },
    {
      id: "log_sample_li_002",
      postId: "post_sample_agro_001",
      channel: "linkedin",
      status: "published",
      publishedUrl: "http://localhost:3000/sandbox/linkedin/urn_li_share_agro_001",
      responsePayload: {
        id: "urn:li:share:agro_001",
        link: "http://localhost:3000/sandbox/linkedin/urn_li_share_agro_001",
        target: "LinkedIn Shares API (Simulated Sandbox Destination)",
      },
      errorMessage: null,
      createdAt: "2026-03-20T13:05:02.000Z",
    },
    {
      id: "log_sample_nl_003",
      postId: "post_sample_agro_001",
      channel: "newsletter",
      status: "published",
      publishedUrl: "http://localhost:3000/sandbox/newsletter/camp_agro_001",
      responsePayload: {
        id: "camp_agro_001",
        link: "http://localhost:3000/sandbox/newsletter/camp_agro_001",
        target: "Newsletter Broadcaster API (Simulated Sandbox Destination)",
      },
      errorMessage: null,
      createdAt: "2026-03-20T13:05:03.000Z",
    },
  ];

  fs.writeFileSync(
    path.join(outDir, "publication-log.json"),
    JSON.stringify(publicationLogs, null, 2),
    "utf-8"
  );
  console.log("✓ Wrote sample-outputs/publication-log.json");

  console.log("\nAll sample deliverables successfully generated in sample-outputs/!");
}

// Allow direct CLI execution
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  generateSampleOutputs().catch((err) => {
    console.error("Export samples failed:", err);
    process.exit(1);
  });
}
