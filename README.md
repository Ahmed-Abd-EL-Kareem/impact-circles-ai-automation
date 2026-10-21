# Impact Circles — AI Automation: Financial Document Assistant (Phase 2)

A production-grade vertical slice for intelligent financial document ingestion, structured multimodal extraction, duplicate detection, request idempotency, and persistent expense management built with **Next.js App Router**, **Neon PostgreSQL**, **Prisma ORM**, **Google Gemini API**, and **n8n workflow orchestration**.

---

## Architecture & Processing Flow

```
[User Browser]
      │  (PDF / PNG / JPEG upload via Drag & Drop UI)
      ▼
[Next.js Server API: POST /api/invoices]
      │  1. Validates magic bytes (%PDF, PNG, JPEG) and 10MB bounds
      │  2. Dispatches payload + shared secret header (`x-webhook-secret`) to n8n
      ▼
[n8n Automation Pipeline (Port 5678)]
      ├─ 1. Webhook Trigger (`POST /webhook/impact-circles-ai-automation`)
      ├─ 2. Validate Request & Shared Secret (`x-webhook-secret` - fails closed on error)
      ├─ 3. Early Idempotency Fast-Path: Checks Neon Postgres for `idempotencyKey`
      │      └─ If match exists: returns persisted record immediately in ~270ms (bypassing AI call)
      ├─ 4. Multimodal Extraction via Google Gemini API (`x-goog-api-key` header)
      ├─ 5. Server-side Extraction Schema & Arithmetic Sanity Validation ($0.02 tolerance)
      ├─ 6. Duplicate Detection Query against Neon PostgreSQL (Parameterized $1..$N SQL)
      ├─ 7. Single-Ownership Persistence with Idempotency (INSERT ... ON CONFLICT DO UPDATE)
      ├─ 8. Respond to Webhook with 201 Created + Persisted Record
      └─ 9. Unified Error Handler: routes Gemini/DB/validation errors to safe HTTP statuses
      │
      ▼
[Next.js Client UI]
      └─ Displays updated expense table, validation badges, subtotal, and issue inspector modal
```

---

## 1. Prerequisites

- **Node.js**: v20+ or v24+ (Node v24.21.0 recommended; tested on Windows x64).
- **PostgreSQL / Neon**: A serverless Neon PostgreSQL database with connection pooling and direct connection URLs.
- **Google Gemini API**: A valid API key from [Google AI Studio](https://aistudio.google.com/).
- **n8n**: Installed globally (`npm install -g n8n`) or executed on demand via `npx n8n`.

---

## 2. Installation

Clone the repository and install dependencies:

```powershell
git clone https://github.com/Ahmed-Abd-EL-Kareem/impact-circles-ai-automation.git
cd impact-circles-ai-automation
npm install
```

### Dependency & Prisma 7 Notes:
- Prisma version is aligned across `@prisma/client@^7.10.1`, `@prisma/adapter-pg@^7.10.1`, and `prisma@^7.10.1`.
- In Prisma 7, connection URLs are defined in `prisma.config.ts`, and runtime connection pooling uses `@prisma/adapter-pg` + `pg`.

---

## 3. Environment Configuration

Copy the example environment file to `.env`:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and fill in your actual credentials:

```env
# Database (Neon PostgreSQL)
DATABASE_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:YOUR_PASSWORD@ep-direct.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Google Gemini API
# Supported multimodal models: gemini-flash-latest, gemini-3.1-flash-lite
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
GEMINI_MODEL="gemini-flash-latest"

# n8n Automation
N8N_BASE_URL="http://localhost:5678"
N8N_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-ai-automation"
N8N_WEBHOOK_SECRET="your-secure-random-secret-key"
```

> **Important**: Do not commit your `.env` file. Keep all credentials server-side.

---

## 4. Neon PostgreSQL Setup & Migrations

To apply database migrations to your Neon database:

```powershell
# Generate Prisma Client
npx prisma generate

# Check migration status
npx prisma migrate status

# Apply pending migrations to Neon
npx prisma migrate deploy
```

The database schema defines the `Expense` model with the following fields and indexes:
- `id` (String primary key)
- `idempotencyKey` (String unique nullable — enforces request-level idempotency)
- `expenseDate` (DateTime nullable)
- `vendor` (String nullable)
- `invoiceNumber` (String nullable)
- `description` (String nullable)
- `subtotalAmount` (Decimal 12,2 nullable — stores pre-tax amount)
- `amount` (Decimal 12,2 nullable — stores total amount)
- `currency` (String nullable)
- `taxAmount` (Decimal 12,2 nullable)
- `category` (String: `personnel`, `travel`, `equipment`, `software`, `events`, `operational`, `uncategorized`)
- `validationStatus` (String: `valid`, `needs_review`, `duplicate_suspected`, `processing_failed`)
- `validationIssues` (JSONB structured list of detected anomalies)
- `sourceFileName` (String)
- `createdAt` & `updatedAt` (DateTime)
- Indexes on `[vendor, invoiceNumber]`, `[validationStatus]`, `[createdAt]`, `[expenseDate]`, `[category]`.

---

## 5. How to Run Next.js Locally

Start the Next.js development server:

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 6. How to Run n8n Locally

Open a new PowerShell terminal and run:

```powershell
# Load .env into the PowerShell session
Get-Content .env | Where-Object { $_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$' } | ForEach-Object {
  [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim('"', "'"))
}

# Allow Code nodes to read environment variables (for shared secret verification)
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE="false"

# Start n8n
npx n8n
```

n8n will start and be accessible at [http://localhost:5678](http://localhost:5678).

---

## 7. How to Import and Configure the Finance Workflow in n8n

### Option A: Automatic Sync (Recommended)
If n8n is running locally with SQLite storage (`~/.n8n/database.sqlite`), you can sync the workflow definition instantly:
```powershell
npm run workflow:sync
```

### Option B: Manual UI Import
1. Open your browser and navigate to `http://localhost:5678`.
2. In the left navigation, click **Workflows** → **Import from File**.
3. Select the file:
   `n8n/workflows/finance-processing.json`
4. Set up the **Neon Postgres** credentials in n8n:
   - In n8n, go to **Credentials** → **New Credential** → **Postgres**.
   - Name it `Neon Postgres (Database)`.
   - Host: Extract from your `DIRECT_URL` (e.g. `ep-holy-bar-b7wwyz9k.c-13.us-east-1.aws.neon.tech`).
   - Database: `neondb`
   - User: `neondb_owner`
   - Password: Your Neon database password.
   - Port: `5432`
   - SSL: `Require` / `Verify-Full`
5. Connect all Postgres nodes in the workflow (`Check Existing Idempotency in Postgres`, `Check Duplicate in Neon Postgres`, and `Persist Expense into Neon Postgres`) to your credential.
6. Ensure the workflow is **Activated** (toggle switch in the top right to **Active**).

---

## 8. Testing & Quality Verification

### Run Unit Tests
A comprehensive test suite of 55 unit tests across 7 suites:

```powershell
npm test
```

Covers:
- **File Validation** (`tests/unit/validation-file.test.ts`): Binary magic-byte inspection (%PDF-, PNG, JPEG), 10MB bounds, and spoofed extension rejection.
- **Extraction Validation** (`tests/unit/validation-extraction.test.ts`): Structured extraction schema validation, arithmetic reconciliation ($0.02 tolerance), UTC calendar validation, and honest nulls.
- **Duplicate Detection** (`tests/unit/duplicate-detection.test.ts`): Primary candidate matching, secondary missing-invoice-number matching, and mismatch immunity.
- **Multi-Currency** (`tests/unit/finance-summary.test.ts`): Strict currency isolation and zero cross-currency addition.
- **Workflow Client** (`tests/unit/workflow-client.test.ts`): n8n offline 503 handling, 401 secret rejection, upstream error propagation, and response verification.
- **Webhook Authentication & Fail-Closed Guardrails** (`tests/unit/webhook-auth.test.ts`): Fail-closed 500 when secret is unconfigured/empty, 401 when header is missing/mismatched, 400 when payload is malformed.
- **Request Idempotency & Concurrency** (`tests/unit/idempotency.test.ts`): Atomic replay guarantees, race condition safety, payload tampering prevention, and timeout recovery.

### Run Integration Tests
The repository provides focused integration scripts and a unified runner:

```powershell
# Run the direct TypeScript pipeline against real Gemini & Neon PostgreSQL
npm run test:direct

# Run the true production n8n End-to-End test (requires n8n on port 5678)
npm run test:e2e

# Run the complete integration suite (both suites sequentially)
npm run test:integration
```

The production n8n E2E suite (`npm run test:e2e`):
1. Confirms live n8n server health (fails immediately with exit code 1 if n8n is offline — zero false positives).
2. Verifies fail-closed authentication: rejects invalid secrets with HTTP 401.
3. Verifies payload guardrails: rejects malformed bodies with HTTP 400.
4. Ingests `test-fixtures/fictional-invoice.pdf` and verifies HTTP 201 response with verified persisted record.
5. Asserts n8n request idempotency replay (identical record returned, zero count increment).
6. Submits business duplicate and verifies `duplicate_suspected` flag and candidate ID capture.
7. Verifies multi-currency summary calculation.
8. Automatically cleans up test records from Neon PostgreSQL.

### Code Quality Verification
```powershell
# Type check
npx tsc --noEmit

# Lint check
npm run lint

# Turbopack build
npm run build
```

---

## 9. End-to-End Manual Verification Checklist

1. **Dashboard Launch**: Navigate to `http://localhost:3000`. The 4 summary cards show real database metrics.
2. **Document Upload**:
   - Drag and drop `test-fixtures/fictional-invoice.pdf` into the upload zone.
   - Observe the live processing indicator.
   - Upon completion, the new expense is added to the table with `valid` status.
3. **Duplicate Detection**:
   - Re-upload `test-fixtures/fictional-duplicate-invoice.pdf` (or the same file again).
   - Observe that the record is persisted and marked as `duplicate_suspected`.
4. **Validation Inspector**:
   - Click the **Inspect** button next to any row.
   - The drawer displays pre-tax subtotal, total, tax amount, idempotency key, and specific anomaly codes.
5. **Filters & Pagination**:
   - Filter by status (`valid`, `needs_review`, `duplicate_suspected`).
   - Filter by category (`software`, `operational`, etc.).
6. **Currency Volumes**:
   - Inspect the **Currency Volumes** card: amounts in USD, EUR, EGP are listed with individual totals, proving that no cross-currency additions occur.

---

## 10. Architectural Invariants

- **Single Persistence Ownership**: n8n is the single orchestration and persistence owner in production; the Next.js API delegates via signed webhook and receives the persisted record.
- **Strict SQL Parameterization**: All SQL queries use bound parameters (`$1..$N`) via `options.queryReplacement`. String interpolation of user input is strictly prohibited.
- **Request Idempotency**: Atomic `ON CONFLICT ("idempotencyKey")` guarantees that retries return the original record without creating duplicate entries.
- **Multi-Currency Invariant**: Cross-currency addition is strictly forbidden without real-time exchange rates. Volumes are displayed separately per currency code.
- **Honest Null Policy**: Missing or unreadable fields remain `null` with status `needs_review`. The AI is never permitted to hallucinate invoice numbers, dates, or amounts.

---

## 11. Phase 3 — AI Content Generation & Automated Publishing Agent

Phase 3 implements the **AI Content Generation & Automated Publishing Agent** specified in the Impact Circles Technical Assessment:

### Capabilities & Workflow
1. **Content Input**: Accepts raw research project descriptions, field milestones, research findings, or event announcements.
2. **AI Generation (Google Gemini)**: Automatically produces three tailored versions with distinct tone, structure, and formatting:
   - **LinkedIn Post**: Professional, engaging, hashtag-optimized with thought-leadership hooks and character telemetry.
   - **Newsletter Summary**: Concise, high signal-to-noise ratio stakeholder briefing with subject, preview, body, and CTA.
   - **Website Announcement**: Comprehensive editorial article in Markdown with headlines, deks, slug, and tags.
3. **Centralized Persistence**: Stored in Neon PostgreSQL via Prisma (`ContentPost` & `PublishingLog` models).
4. **Human Approval Workflow**:
   - An authorized team member reviews the generated versions in the interactive review sheet.
   - The team member can edit any field (title, channel copy, slug, etc.) where necessary.
   - **Strict Approval Guardrail**: Publication cannot occur without explicit human approval.
   - **Re-Approval Invariant**: Any edit made to an approved post immediately resets its status to `in_review`, requiring renewed approval before publishing.
5. **Automated Publishing**:
   - Once approved, clicking **Publish to Selected Channels** executes multi-channel automated dispatch.
   - Dispatches to configured live CMS / social webhooks, or executes in demonstration sandbox mode generating verified URLs.
   - Persists execution timestamps, status (`success` / `simulated` / `failed`), and published URLs into `PublishingLog`.

### n8n Content Publishing Workflow
The automated workflow definition is provided in `n8n/workflows/content-publishing.json`:
- **Webhook Endpoint**: `POST /webhook/impact-circles-content-publishing`
- **Authentication**: Secured with `x-webhook-secret` header matching `N8N_WEBHOOK_SECRET` (fail-closed).
- **Two Pipeline Actions**:
  - `action: "generate"`: Calls Google Gemini API, validates and sanitizes 3 tailored channel outputs, and persists the draft into Neon PostgreSQL (`ContentPost`).
  - `action: "publish"`: Fetches `ContentPost`, enforces strict human approval check (`status === 'approved'`), dispatches to selected channels (Website CMS, LinkedIn, Newsletter), logs results into `PublishingLog`, and updates `ContentPost` status to `published`.
- **To Import**: Open n8n (`http://localhost:5678`), navigate to **Workflows** → **Import from File**, select `n8n/workflows/content-publishing.json`, connect the `Neon Postgres (Database)` credential, and set to **Active**.

### Manual Verification Checklist
1. Open [http://localhost:3000](http://localhost:3000) and click the **Content & Publishing** tab in the top navigation.
2. Click any of the sample quick-picks (e.g. *Clean Water Sensor Milestone*) or paste custom research findings into the text area.
3. Click **Generate Tailored Content**. Google Gemini produces the 3-channel content package in real time and persists it to Neon PostgreSQL.
4. The **Review & Approve** modal opens automatically:
   - Switch between **Website Announcement**, **LinkedIn Post**, and **Newsletter Update** tabs.
   - Edit any text field and click **Save Edits**.
   - Notice that if the post was previously approved, saving edits flags that re-approval is required.
5. Click **Approve Content**. The status transitions to `Approved`.
6. Click **Publish to Selected Channels**. The automated dispatcher executes, records publication URLs (e.g. `https://impactcircles.org/announcements/...`), and displays the result in the **Publishing Audit** tab.
