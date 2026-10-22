# n8n Workflow Automation Architecture

This directory contains the production-grade **n8n orchestration workflows** for Impact Circles AI Automation:

| Workflow File | Name | Primary Webhook Path | Orchestration Scope |
| :--- | :--- | :--- | :--- |
| **`finance-processing.json`** | Finance Document Processing Pipeline | `POST /webhook/impact-circles-ai-automation` | Ingestion, Gemini extraction, arithmetic reconciliation, duplicate detection, and Neon PostgreSQL persistence. |
| **`content-publishing.json`** | Content Generation & Publishing Pipeline | `POST /webhook/impact-circles-content-publishing` | Gemini multi-channel content generation, strict human-approval guard enforcement, and multi-channel dispatch with audit logging. |

---

## 1. Workflows Overview

### A. `finance-processing.json` (Financial Document Assistant)
- **Ingestion & Validation**: Accepts base64-encoded PDF, PNG, or JPEG documents with magic-byte and 10MB bounds checks.
- **Fail-Closed Security**: Validates `x-webhook-secret` header against `N8N_WEBHOOK_SECRET` before parsing payloads.
- **Request-Level Idempotency Fast-Path**: Immediately queries Neon PostgreSQL for `idempotencyKey`. If found, replays the existing record in ~270ms, bypassing redundant Gemini API calls and conserving quota.
- **Multimodal AI Extraction**: Dispatches document buffer to Google Gemini API (`gemini-flash-latest` / `gemini-3.1-flash-lite`) requesting structured JSON.
- **Arithmetic & Currency Reconciliation**:
  - Validates `subtotal + tax == total` within \$0.02 tolerance (flags `ARITHMETIC_MISMATCH` if anomalous).
  - Rejects zero or negative amounts.
  - Normalizes currency codes to ISO 4217 (zero cross-currency addition).
- **Two-Tier Duplicate Detection**:
  - Primary exact match: `vendor` + `invoiceNumber` + `amount` + `currency`.
  - Secondary match (for receipts without invoice numbers): `vendor` + `expenseDate` + `amount` + `currency`.
  - Uses parameterized PostgreSQL queries (`$1..$N`) preventing SQL injection.
- **Persistence & Single Source of Truth**: Persists into Neon PostgreSQL (`Expense` table) and returns the verified record to Next.js.
- **Automatic Fallback**: If n8n is offline or `N8N_WEBHOOK_URL` is unset in `.env`, the Next.js API automatically routes through its built-in direct pipeline (`src/lib/services/pipeline.ts`).

---

### B. `content-publishing.json` (Content Generation & Publishing Agent)
- **Multi-Action Pipeline**: Handles two distinct actions via a single authenticated webhook:
  - `action: "generate"`
  - `action: "publish"`
- **Authentication**: Secured with `x-webhook-secret` header matching `N8N_WEBHOOK_SECRET`.
- **Action 1: Content Generation (`action: "generate"`)**:
  - Receives `sourcePrompt`, `contentType` (`research_update`, `event_announcement`, `project_findings`), `targetChannels`, and optional `additionalInstructions`.
  - Prompts Google Gemini with channel-specific instructions adapting tone, length, hashtags, and formatting.
  - Validates all 3 formats:
    - **LinkedIn Post**: Hook, body, hashtags array, accurate character count.
    - **Newsletter Summary**: Subject, preview text, body, call-to-action.
    - **Website Announcement**: Editorial article in Markdown, subtitle, slug, tags array.
  - Inserts new post into Neon PostgreSQL (`ContentPost` table) with status `draft`.
  - Returns formatted post to Next.js.
- **Action 2: Automated Multi-Channel Publishing (`action: "publish"`)**:
  - Receives `postId` and optional `channels`.
  - Fetches post from Neon PostgreSQL.
  - **Strict Human Approval Guardrail**: Server-enforces `post.status === 'approved'`. If not approved, execution halts immediately with HTTP 400.
  - **Channel Selection Guardrail**: Validates requested channels against approved channels.
  - Dispatches each channel to configured live endpoints or local sandbox mock APIs:
    - Website CMS: `POST /api/sandbox/cms/posts`
    - LinkedIn: `POST /api/sandbox/linkedin/posts`
    - Newsletter: `POST /api/sandbox/newsletter/send`
  - Records granular dispatch results into `PublishingLog` in Neon PostgreSQL.
  - Updates `ContentPost` status to `published` (or `partially_published` / `failed`).
- **Automatic Fallback**: If `N8N_CONTENT_WEBHOOK_URL` is unset or n8n is offline, the Next.js API automatically runs generation and publishing via its internal engine (`src/lib/content/gemini-content.ts` & `src/lib/services/publishing.ts`).

---

## 2. Environment Configuration

### Next.js App Environment (`.env`)

```env
# Shared Secret for Webhook Authentication (Must match n8n environment)
N8N_WEBHOOK_SECRET="REPLACE_WITH_A_SECURE_RANDOM_SECRET"

# Phase 2: Finance Webhook (Uncomment only if running n8n)
# N8N_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-ai-automation"

# Phase 3: Content Publishing Webhook (Uncomment only if running n8n)
# N8N_CONTENT_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-content-publishing"
```

> **Note on Zero-Config First Run**: By default, both `N8N_WEBHOOK_URL` and `N8N_CONTENT_WEBHOOK_URL` are commented out in `.env.example`. When unset, Next.js uses its built-in direct pipeline without requiring n8n to be running.

### n8n Server Environment Variables

When running n8n (via Docker or desktop), provide:

```env
N8N_WEBHOOK_SECRET="REPLACE_WITH_A_SECURE_RANDOM_SECRET"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
DATABASE_URL="postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"
```

---

## 3. How to Import and Activate in n8n

1. Start your local n8n instance:
   ```bash
   npx n8n
   # or with docker:
   # docker run -it --rm --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
   ```
2. Open `http://localhost:5678` in your browser.
3. Configure Credentials in n8n:
   - **Postgres Credential**: Create a new Postgres credential with your Neon database connection string (host, database name, user, password, port 5432, SSL: `require`).
   - **Google Gemini Credential**: If using LangChain nodes, add your Gemini API Key.
4. Import Workflows:
   - In n8n, click **Workflows** → **Import from File**.
   - Select `n8n/workflows/finance-processing.json`. Connect the Postgres credential to all Postgres nodes and toggle **Active**.
   - Repeat for `n8n/workflows/content-publishing.json`. Connect credentials and toggle **Active**.
5. Enable in Next.js:
   - In your `.env` file, uncomment `N8N_WEBHOOK_URL` and/or `N8N_CONTENT_WEBHOOK_URL`.
   - The Next.js dashboard will now delegate processing to n8n while seamlessly falling back if n8n is stopped.
