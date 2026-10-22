# n8n Workflow Automation Architecture

This directory contains the production-grade **n8n orchestration workflows** for Impact Circles AI Automation:

| Workflow File | Name | Primary Webhook Path | Orchestration Scope |
| :--- | :--- | :--- | :--- |
| **`finance-processing.json`** | Finance Document Processing Pipeline | `POST /webhook/impact-circles-ai-automation` | Ingestion, Gemini extraction, arithmetic reconciliation, duplicate detection, and Neon PostgreSQL persistence. |
| **`content-publishing.json`** | Content Generation & Publishing Pipeline | `POST /webhook/impact-circles-content-publishing` | Gemini multi-channel content generation, strict validation, human-approval enforcement, and real sandbox HTTP dispatch with audit logging. |

---

## 1. Workflows Overview

### A. `finance-processing.json` (Financial Document Assistant)
- **Ingestion & Validation**: Accepts base64-encoded PDF, PNG, or JPEG documents with magic-byte and 10MB bounds checks.
- **Fail-Closed Security**: Validates `x-webhook-secret` (or `X-Webhook-Secret`) header against `$env.N8N_WEBHOOK_SECRET`. Fails closed with HTTP 500 if the secret is unconfigured on the server, and rejects with HTTP 401 on missing or incorrect secrets.
- **Request-Level Idempotency Fast-Path**: Queries Neon PostgreSQL for `idempotencyKey`. If found, replays the existing record immediately, bypassing redundant Gemini API calls and conserving quota.
- **Multimodal AI Extraction**: Calls Google Gemini API via an `httpRequest` node requesting structured JSON.
- **Arithmetic & Currency Reconciliation**:
  - Validates `subtotal + tax == total` within \$0.02 tolerance (flags `ARITHMETIC_MISMATCH` if anomalous).
  - Rejects zero or negative amounts.
  - Normalizes currency codes to ISO 4217 (zero cross-currency addition).
- **Two-Tier Duplicate Detection**:
  - Primary exact match: `vendor` + `invoiceNumber` + `amount` + `currency`.
  - Secondary match (for receipts without invoice numbers): `vendor` + `expenseDate` + `amount` + `currency`.
  - Parameterized PostgreSQL queries (`$1..$N`) preventing SQL injection.
- **Persistence**: Inserts into Neon PostgreSQL (`Expense` table) and returns the verified record to Next.js.
- **Automatic Fallback**: If n8n is offline or `N8N_WEBHOOK_URL` is unset in `.env`, the Next.js API automatically routes through its built-in direct pipeline (`src/lib/services/pipeline.ts`).

---

### B. `content-publishing.json` (Content Generation & Publishing Agent)
- **Multi-Action Pipeline**: Handles two distinct actions via a single authenticated webhook:
  - `action: "generate"`
  - `action: "publish"`
- **Fail-Closed Security**: Secured with `x-webhook-secret` matching `$env.N8N_WEBHOOK_SECRET`. Rejects missing/wrong secrets (HTTP 401) and fails closed if `$env.N8N_WEBHOOK_SECRET` is unset (HTTP 500).
- **Action 1: Content Generation (`action: "generate"`)**:
  - Receives `sourcePrompt` (min 10 chars), `contentType` (`research_update`, `event_announcement`, `project_findings`), `targetChannels`, and optional `additionalInstructions`.
  - Prompts Google Gemini for all 3 formats:
    - **LinkedIn Post**: Hook, insights, hashtags array, accurate character count.
    - **Newsletter Summary**: Subject, preview text, body, call-to-action.
    - **Website Announcement**: Editorial article in Markdown, subtitle, kebab-case slug, tags array.
  - **Strict Validation Guardrail**: Validates the output package against `GeneratedContentPackage`. Rejects missing, empty, or malformed fields with HTTP 422 instead of silently defaulting or fabricating content.
  - Inserts new post into Neon PostgreSQL (`ContentPost` table) with status `draft`.
  - Returns formatted post to Next.js with HTTP 201.
- **Action 2: Automated Multi-Channel Publishing (`action: "publish"`)**:
  - Receives `postId` and optional `channels`.
  - Fetches post and its prior logs from Neon PostgreSQL (`ContentPost` and `PublishingLog`).
  - **Strict Human Approval Guardrail**: Server-enforces explicit human approval (`post.approvedAt !== null`). Rejects drafts, in_review, and rejected posts with HTTP 400.
  - **Channel Selection Guardrail**: Validates requested channels against approved channels. Channel modifications require renewed approval before publication.
  - **Retry Deduplication**: Checks prior successful publishing logs. Channels already published successfully (`status: 'published'`) are skipped to prevent duplicate publishing.
  - **Real Sandbox HTTP Dispatch**: Calls the genuine sandbox endpoints via an `n8n-nodes-base.httpRequest` node:
    - Website CMS: `POST {{ $env.SANDBOX_BASE_URL || 'http://localhost:3000' }}/api/sandbox/cms/posts`
    - LinkedIn: `POST {{ $env.SANDBOX_BASE_URL || 'http://localhost:3000' }}/api/sandbox/linkedin/posts`
    - Newsletter: `POST {{ $env.SANDBOX_BASE_URL || 'http://localhost:3000' }}/api/sandbox/newsletter/send`
  - Sends `Authorization: Bearer {{ $env.SANDBOX_API_KEY || 'sandbox_demo_secret_key' }}`.
  - **Accurate Outcome & URL Capture**: Captures real returned publication links and payloads from each sandbox response. Never fabricates fake URLs.
  - Persists audit logs into `PublishingLog` in Neon PostgreSQL.
  - Updates `ContentPost.status` based on actual outcomes:
    - `published` when all approved channels succeed.
    - `partially_published` when at least one succeeds and at least one fails.
    - `failed` when all attempted channels fail.
- **Automatic Fallback**: If `N8N_CONTENT_WEBHOOK_URL` is unset or n8n is offline, Next.js executes generation and publishing via its internal direct engine (`src/lib/content/gemini-content.ts` & `src/lib/services/publishing.ts`).

---

## 2. Environment Configuration

### Next.js Application Environment (`.env`)

```env
# Shared Secret for Webhook Authentication (Must match n8n environment)
N8N_WEBHOOK_SECRET="REPLACE_WITH_A_SECURE_RANDOM_SECRET"

# Phase 2: Finance Webhook (Uncomment only if running n8n)
# N8N_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-ai-automation"

# Phase 3: Content Publishing Webhook (Uncomment only if running n8n)
# N8N_CONTENT_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-content-publishing"

# Sandbox Publishing Configuration
SANDBOX_BASE_URL="http://localhost:3000"
SANDBOX_API_KEY="sandbox_demo_secret_key"
SANDBOX_FAIL_CHANNELS=""
```

### n8n Server Environment Variables

Provide the following environment variables to your n8n runtime (via desktop `.env`, shell, or Docker):

```env
# Shared webhook secret (Must match Next.js N8N_WEBHOOK_SECRET)
N8N_WEBHOOK_SECRET="REPLACE_WITH_A_SECURE_RANDOM_SECRET"

# Google Gemini API key
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Neon PostgreSQL connection string
DATABASE_URL="postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"

# Reachable base URL for sandbox HTTP dispatch:
# - Local Next.js + local n8n: http://localhost:3000
# - Local Next.js + Docker n8n: http://host.docker.internal:3000
# - Local Next.js + hosted n8n Cloud: Public tunnel URL (e.g. ngrok or Cloudflare Tunnel)
SANDBOX_BASE_URL="http://localhost:3000"
SANDBOX_API_KEY="sandbox_demo_secret_key"
```

---

## 3. How to Import and Activate in n8n

### Method 1: Automatic SQLite Sync (Local n8n CLI)

If you have a local n8n instance installed (`~/.n8n/database.sqlite`), you can synchronize both workflows with a single command:

```bash
npm run workflow:sync
```

This updates both `Finance Document Processing Pipeline` and `Content Generation and Publishing Pipeline` in SQLite while preserving active state and credentials.

### Method 2: Manual Import via n8n Web UI

1. Start your local n8n instance:
   ```bash
   npx n8n
   # or with docker:
   # docker run -it --rm --name n8n -p 5678:5678 -e N8N_WEBHOOK_SECRET="..." -e SANDBOX_BASE_URL="..." n8nio/n8n
   ```
2. Open `http://localhost:5678` in your browser.
3. Configure Credentials in n8n:
   - **Postgres Credential**: Create a new Postgres credential with your Neon database connection parameters (host, database name, user, password, port 5432, SSL: `require`).
   - **Google Gemini (PaLM) Api**: Add your `GEMINI_API_KEY`.
4. Import Workflows:
   - Click **Workflows** → **Import from File**.
   - Select `n8n/workflows/finance-processing.json`. Connect the Postgres credential and toggle **Active**.
   - Select `n8n/workflows/content-publishing.json`. Connect the Postgres and Gemini credentials and toggle **Active**.
5. Enable in Next.js:
   - In `.env`, uncomment `N8N_WEBHOOK_URL` and `N8N_CONTENT_WEBHOOK_URL`.
   - The application will now delegate requests to n8n and seamlessly fall back to the built-in direct pipeline if n8n is stopped.
