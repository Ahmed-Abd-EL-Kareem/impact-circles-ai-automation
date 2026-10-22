<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Project Guidelines & Rules for Agents (Impact Circles — AI Automation)

## System Overview
- **Next.js 16 App Router** (React 19, Turbopack, Tailwind CSS).
- **Database & ORM**: PostgreSQL hosted on **Neon**, accessed using **Prisma 7** with `@prisma/adapter-pg` connection pooler (`prisma.config.ts` and `src/lib/db.ts`).
- **AI Multimodal Extraction**: **Google Gemini API** (`gemini-flash-latest` / `gemini-3.1-flash-lite`) extracting structured JSON from PDFs, PNGs, and JPEGs.
- **Workflow Automation**: **n8n** webhook orchestration (`POST /webhook/impact-circles-ai-automation`) with shared-secret authentication.

## Strict Rules & Invariants

### 1. Currency & Financial Invariants
- **NEVER sum across different currencies** without real-time exchange rates.
- Always group financial totals and reporting strictly by ISO 4217 currency code (`USD`, `EUR`, `EGP`, etc.).
- Validate arithmetic reconciliation: `subtotal + taxAmount == amount` within \$0.02 tolerance. Flag mismatches.
- Ensure `taxAmount <= amount` and all amounts are positive non-zero numbers.

### 2. Security & Upload Invariants
- All incoming uploads must undergo **magic-byte inspection** (`%PDF-`, PNG, JPEG) and enforce a **10MB** cap.
- Webhook endpoints must validate the `x-webhook-secret` header against `process.env.N8N_WEBHOOK_SECRET`.
- Never expose API keys or DB connection strings to client bundles.

### 3. Duplicate Detection Logic
- Always probe existing database records before approving an invoice:
  - **Primary**: Same `vendor` + `invoiceNumber` + `amount` + `currency`.
  - **Secondary**: Same `vendor` + `expenseDate` + `amount` + `currency` (if invoice number is null).
- Flag duplicates as `duplicate_suspected` and preserve candidate IDs in `validationIssues`.

### 4. Database & Prisma Conventions
- Use `Decimal(12, 2)` for monetary numbers.
- Store structured validation anomalies in the `validationIssues` JSONB column.
- Always use the singleton Prisma client from `@/lib/db`.
- Database schema changes require Prisma migrations (`npx prisma migrate dev` / `deploy`).

### 5. Quality & Verification
- Run `npm test` before committing. All 24 unit tests must pass.
- Run `npm run build` to verify Next.js Turbopack compilation and TypeScript type checking.
- For full architecture details and deliverable logs, see [RULES.md](file:///d:/JOBS/impact-circles-ai-automation/RULES.md) and [WHAT_WE_MADE.md](file:///d:/JOBS/impact-circles-ai-automation/WHAT_WE_MADE.md).
