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
- **Agent File Integrity**:
  - The Next.js development server automatically generates and expects the `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md`. Never delete or tamper with that block.

### 1.2 Prisma 7 & Neon PostgreSQL
- **Connection Configuration**:
  - Prisma 7 configuration is managed via `prisma.config.ts`.
  - Database client connections in `src/lib/db.ts` must use `@prisma/adapter-pg` pool adapter with `pg.Pool` for serverless pooling.
  - Never instantiate duplicate `PrismaClient` instances. Always import the global singleton from `@/lib/db`.
- **Schema & Migrations**:
  - Monetary values must use `Decimal(12, 2)`. Never store currency amounts as floating-point numbers.
  - Complex validation outputs and anomaly lists must be stored in the structured `validationIssues` JSONB column.
  - All schema modifications must be applied via `npx prisma migrate dev` or `npx prisma migrate deploy`. Never edit the Neon database directly.

### 1.3 n8n Workflow Orchestration
- **Single-Ownership Persistence Discipline**:
  - In the primary production pipeline, n8n owns execution and inserts the verified expense into Neon PostgreSQL.
  - The Next.js API acts as an authenticated entrypoint and validates incoming file payloads before dispatching to n8n.
  - Fallback execution in Next.js is strictly for offline development resilience and must adhere to the exact same validation and schema rules.
- **Workflow Security**:
  - All calls to the n8n webhook must include the shared secret header `x-webhook-secret`.
  - Any webhook request lacking or failing this header must be rejected immediately with HTTP 401 Unauthorized.

---

## 2. Financial & Data Integrity Rules

### 2.1 Multi-Currency Invariants
- **STRICT PROHIBITION AGAINST CROSS-CURRENCY ADDITIONS**:
  - You must NEVER sum financial figures across differing currency codes without explicit, dated exchange rates.
  - All financial aggregations (in APIs, UI summary cards, and exports) must group volumes separately by ISO 4217 currency code (e.g., `USD: $12,450.00`, `EUR: €4,200.00`, `EGP: 35,000.00 EGP`).
- **Currency Normalization**:
  - Symbols must be normalized to standard ISO 4217 uppercase codes (`$` $\to$ `USD`, `€` $\to$ `EUR`, `£` $\to$ `GBP`, `₹` $\to$ `INR`).
  - Unrecognized currency codes must be flagged with an anomaly warning.

### 2.2 Mathematical & Arithmetic Reconciliation
- For every extracted invoice:
  - If `subtotal` and `taxAmount` are present, `subtotal + taxAmount` must equal `amount` (total) within a \$0.02 tolerance (to account for rounding). Discrepancies must be flagged as `arithmetic_mismatch`.
  - `taxAmount` must never exceed `amount`. Violations must be flagged as `tax_exceeds_total`.
  - Extracted amounts must be strictly positive ($> 0$). Negative or zero values must be marked as invalid.

### 2.3 Duplicate Detection Invariants
- Every ingested document must be checked against existing records before finalizing status:
  1. **Primary Match**: Same `vendor` + `invoiceNumber` + `amount` + `currency` $\to$ immediate flag as `duplicate_suspected`.
  2. **Secondary Match (Missing Invoice Number)**: Same `vendor` + `expenseDate` + `amount` + `currency` $\to$ flag as `duplicate_suspected`.
- Flagged duplicates must still be persisted to ensure an immutable audit log, with their `validationStatus` set to `duplicate_suspected` and candidate IDs recorded in `validationIssues`.

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

## 4. Code Quality & Development Standards

### 4.1 TypeScript & Code Style
- `strict: true` is enforced in `tsconfig.json`. Do not use `any` unless strictly necessary for untyped third-party boundaries, and even then, wrap with runtime validation.
- All domain interfaces must reside in `src/lib/types/` (e.g., `src/lib/types/expense.ts`).

### 4.2 Testing Standards
- All core business logic (file validation, extraction schema checking, duplicate detection, currency grouping, workflow communication) must have unit test coverage.
- Tests use Node's native test runner (`tests/unit/*.test.ts`). Run via `npm test`.
- All tests must pass cleanly before any code is committed or merged.

### 4.3 Git Commit Discipline
- Make atomic, descriptive commits following conventional commit syntax (e.g., `feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- Verify build (`npm run build`) and test suite (`npm test`) pass with zero errors before pushing.
