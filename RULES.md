# Engineering Rules & Architecture Standards
## Impact Circles — AI Automation (Financial Document Assistant)

This document establishes the mandatory architectural rules, engineering standards, and invariants that every developer and AI agent working on this codebase MUST follow.

---

## 1. Architectural & Technology Stack Rules

### 1.1 Next.js 16 App Router
- **Runtime & Routing**: Use App Router conventions (`src/app/`). All route handlers must live in `route.ts` under `src/app/api/...`.
- **Component Separation**:
  - Default to **React Server Components (RSC)** where interactive state or browser APIs are not needed.
  - Mark client-interactive components explicitly with `'use client'` at the very top (e.g., upload zones, modals, dynamic tables).
  - Do not trigger synchronous `setState` in `useEffect` bodies (comply with React 19/Next 16 linter).
- **Agent File Integrity**:
  - The Next.js development server automatically generates and expects the `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md`. Never delete or tamper with that block.

### 1.2 Prisma 7 & Neon PostgreSQL
- **Connection Configuration**:
  - Prisma 7 configuration is managed via `prisma.config.ts`.
  - Database client connections in `src/lib/db.ts` must use `@prisma/adapter-pg` pool adapter with `pg.Pool` for serverless pooling.
  - Never instantiate duplicate `PrismaClient` instances. Always import the global singleton from `@/lib/db`.
- **Schema & Migrations**:
  - Monetary values must use `Decimal(12, 2)`. Never store currency amounts as floating-point numbers.
  - Store pre-tax amounts in `subtotalAmount Decimal(12, 2)?` for financial reconciliation.
  - Enforce request-level idempotency with `idempotencyKey String? @unique`.
  - Complex validation outputs and anomaly lists must be stored in the structured `validationIssues` JSONB column.
  - All schema modifications must be applied via `npx prisma migrate dev` or `npx prisma migrate deploy`. Never edit the Neon database directly.

### 1.3 n8n Workflow Orchestration
- **Single-Ownership Persistence Discipline**:
  - In the primary production pipeline, n8n owns execution and inserts the verified expense into Neon PostgreSQL.
  - The Next.js API acts as an authenticated entrypoint and validates incoming file payloads before dispatching to n8n.
  - Fallback execution in Next.js is strictly for offline development resilience and must adhere to the exact same validation and schema rules.
- **Workflow Security & SQL Parameterization**:
  - All database queries in n8n Postgres nodes MUST use bound parameters (`$1..$N`) via `options.queryReplacement`. NEVER interpolate variables directly into SQL strings.
  - Webhook requests must validate the `x-webhook-secret` header against `process.env.N8N_WEBHOOK_SECRET` before executing AI or database nodes. If secret is missing/empty, fail closed with HTTP 500; if header is missing or mismatched, reject with HTTP 401; if payload is malformed, reject with HTTP 400.
  - Ensure duplicate check queries return a deterministic single-row item (`SELECT (SELECT ...) AS "matchedCandidate"`) so zero-match cases do not stall workflow execution.
  - Persistence queries must handle idempotency conflicts atomically via `ON CONFLICT ("idempotencyKey") DO UPDATE SET "updatedAt" = "Expense"."updatedAt" RETURNING *`.
  - Format response node returns HTTP 201 with `{ success: true, expense: $json }` directly from the confirmed persisted record.

---

## 2. Financial & Data Integrity Rules

### 2.1 Multi-Currency Invariants
- **STRICT PROHIBITION AGAINST CROSS-CURRENCY ADDITIONS**:
  - You must NEVER sum financial figures across differing currency codes without explicit, dated exchange rates.
  - All financial aggregations (in APIs, UI summary cards, and exports) must group volumes separately by ISO 4217 currency code (e.g., `USD: $12,450.00`, `EUR: €4,200.00`, `EGP: 35,000.00 EGP`).
- **Currency Normalization**:
  - Symbols must be normalized to standard ISO 4217 uppercase codes (`$` $\to$ `USD`, `€` $\to$ `EUR`, `£` $\to$ `GBP`, `LE`/`EGP` $\to$ `EGP`, `AED` $\to$ `AED`, `SAR` $\to$ `SAR`).
  - Unrecognized currency codes must be flagged with an anomaly warning.

### 2.2 Mathematical & Arithmetic Reconciliation
- For every extracted invoice:
  - If `subtotalAmount` and `taxAmount` are present, `subtotalAmount + taxAmount` must equal `amount` (total) within a \$0.02 tolerance (to account for rounding). Discrepancies must be flagged as `ARITHMETIC_MISMATCH`.
  - `taxAmount` must never exceed `amount`. Violations must be flagged as `TAX_EXCEEDS_TOTAL`.
  - Extracted amounts must be strictly positive ($> 0$). Negative or zero values must be marked as invalid (`ZERO_AMOUNT`, `NEGATIVE_AMOUNT`).

### 2.3 Duplicate Detection Invariants
- Every ingested document must be checked against existing records before finalizing status:
  1. **Primary Match**: Case-insensitive `vendor` + case-insensitive non-empty `invoiceNumber` + exact `amount` + `currency` $\to$ flag as `duplicate_suspected`.
  2. **Secondary Match (Missing Invoice Number Only)**: Used STRICTLY when the incoming document lacks an invoice number. Matches same `vendor` + same calendar day `expenseDate` + `amount` + `currency`, AND requires that the existing record ALSO lacks an invoice number.
  - Never use the weaker date match when the incoming document has an invoice number.
- Flagged duplicates must still be persisted to ensure an immutable audit log, with their `validationStatus` set to `duplicate_suspected` and candidate IDs recorded in `validationIssues`.

### 2.4 Request Idempotency
- Generate one unique request idempotency key per logical upload operation (`req_<timestamp>_<random>`).
- Preserve that key across network failures, timeouts, and user retries via the upload UI "Retry Upload" handler.
- Enforce uniqueness atomically in Neon PostgreSQL via `@unique` constraint and `ON CONFLICT ("idempotencyKey") DO UPDATE SET "updatedAt" = "Expense"."updatedAt" RETURNING *`.
- Replaying the identical idempotency key returns the previously persisted record without modifying fields or creating duplicate database rows.
- Concurrency races must resolve safely without unhandled errors or duplicate records.

---

## 3. Security & Validation Rules

### 3.1 Binary Magic-Byte Inspection
- Never trust file extensions or client-provided MIME types alone.
- Every uploaded document must be validated against its binary header signatures:
  - **PDF**: `%PDF-` (`0x25 0x50 0x44 0x46 0x2D`)
  - **PNG**: `0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A`
  - **JPEG**: `0xFF 0xD8 0xFF`
- Reject any file exceeding the **10 MB** size threshold before base64 encoding or passing to AI models.

### 3.2 AI Extraction Guardrails (Google Gemini)
- Use `@google/genai` with `gemini-flash-latest` or `gemini-3.1-flash-lite`.
- Always enforce structured JSON schema output (`responseMimeType: "application/json"`).
- **Honest Null Policy**: Prompts must strictly instruct the model to return `null` for unreadable or absent fields. Hallucinating fake invoice numbers, dates, or vendor names is forbidden.
- Missing required fields must trigger status `needs_review` rather than failing the extraction outright.

### 3.3 Secrets & Environment Hygiene
- Never commit `.env` or `.env.local` to git.
- Only `.env.example` should be tracked, containing placeholder keys and descriptive documentation.
- Client components must NEVER import or reference server secrets (`DATABASE_URL`, `DIRECT_URL`, `GEMINI_API_KEY`, `N8N_WEBHOOK_SECRET`).

---

## 4. Code Quality & Verification Standards

### 4.1 TypeScript & Code Style
- `strict: true` is enforced in `tsconfig.json`. Do not use `any` unless strictly necessary for untyped third-party boundaries.
- All domain interfaces must reside in `src/lib/types/` (e.g., `src/lib/types/expense.ts`).

### 4.2 Quality Gates
- **Type Checking**: `npx tsc --noEmit` must pass with 0 errors.
- **Linting**: `npm run lint` must pass with 0 errors and 0 warnings.
- **Unit Tests**: `npm test` must run all 50 tests across 7 test suites with 100% pass rate.
- **Turbopack Build**: `npm run build` must compile cleanly without errors.
- **Direct Pipeline Test**: `npm run test:direct` verifies Gemini extraction, schema validation, idempotency replay, and duplicate detection against Neon PostgreSQL.
- **Production n8n E2E Test**: `npm run test:e2e` verifies live n8n fail-closed auth (401/400), valid document ingestion (201), idempotency replay, and duplicate detection. Fails non-zero if n8n is offline (zero false successes).
- **Full Integration Suite**: `npm run test:integration` executes both direct and production n8n E2E suites sequentially.

### 4.3 Git Commit Discipline
- Make atomic, descriptive commits following conventional commit syntax (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- Verify build and tests pass before committing or pushing.
