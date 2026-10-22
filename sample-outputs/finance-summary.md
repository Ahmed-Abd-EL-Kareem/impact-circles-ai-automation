# Financial Document Assistant — Executive Summary

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
| `exp_sample_valid_001` | Acme Cloud Hosting Inc. | `valid` | None (Reconciled: subtotal $150 + tax $15 = $165) |
| `exp_sample_duplicate_002` | Acme Cloud Hosting Inc. | `duplicate_suspected` | Duplicate collision with prior record `exp_sample_valid_001` |
| `exp_sample_missing_003` | Local Hardware Mart | `needs_review` | Missing invoice identifier, missing date, missing pre-tax subtotal |
