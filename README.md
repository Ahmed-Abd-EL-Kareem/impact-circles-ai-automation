# Impact Circles — AI Automation Assessment Demo

A full-stack vertical slice demonstration for intelligent financial document ingestion, structured multimodal data extraction, duplicate detection, and human-in-the-loop multi-channel content generation with sandbox publishing. Built for the Impact Circles AI Agents & Automation Developer assessment.

📄 **[Download Technical Documentation (PDF)](./Technical_Documentation.pdf)** — Comprehensive explanation of the architecture, tools, integrations, limitations, and workflow reproduction instructions.

---

## Architecture & Processing Flow

```
[User Browser / Reviewer]
    │
    ├─► Drag & Drop Invoices ──► [POST /api/invoices]
    │                                 │ (Magic bytes & 10MB bounds check)
    │                                 ├─► [n8n Webhook / Direct Pipeline Fallback]
    │                                 │     ├─► Google Gemini API (Structured JSON extraction)
    │                                 │     ├─► Currency & Arithmetic Reconciliation ($0.02)
    │                                 │     ├─► Duplicate Detection Query
    │                                 │     └─► Neon PostgreSQL (Prisma 7)
    │                                 ▼
    │                          [Expense Ledger, Category Breakdown & CSV Export]
    │
    └─► Prompt / Generate   ──► [POST /api/content]
                                      │ (Drafts 3 channels: Website CMS, LinkedIn, Newsletter)
                                      ▼
                                [Human Review & Passcode Guard]
                                      │ (Server-enforced approval; edits reset to in_review)
                                      ▼
                                [POST /api/content/[id]/publish]
                                      │ (Real HTTP fetch with Bearer auth to Sandbox)
                                      ├─► POST /api/sandbox/cms/posts        ──► /sandbox/news/[slug]
                                      ├─► POST /api/sandbox/linkedin/posts   ──► /sandbox/linkedin/[id]
                                      └─► POST /api/sandbox/newsletter/send  ──► /sandbox/newsletter/[id]
```

---

## Technology Stack

- **Framework**: Next.js 16 App Router (React 19, Tailwind CSS, Turbopack).
- **Database & ORM**: PostgreSQL on Neon with connection pooling via Prisma 7 (`@prisma/adapter-pg`).
- **AI Multimodal Extraction & Generation**: Google Gemini API (`gemini-flash-latest` / `gemini-3.1-flash-lite`).
- **Workflow Automation**: n8n workflow orchestration with direct pipeline fallback when n8n is offline.
- **Verification**: Node.js native test runner (89 passing unit tests across 12 suites).

---

## Quick Start

Requires Node.js 22+.

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Ahmed-Abd-EL-Kareem/impact-circles-ai-automation.git
cd impact-circles-ai-automation
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
# macOS / Linux
cp .env.example .env

# Windows (Command Prompt / PowerShell)
copy .env.example .env
```

Edit `.env` with your credentials:

```env
DATABASE_URL="postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require"
GEMINI_API_KEY="your-google-gemini-api-key"
GEMINI_MODEL="gemini-flash-latest"

# Sandbox Publishing
SANDBOX_BASE_URL="http://localhost:3000"
SANDBOX_API_KEY="sandbox_demo_secret_key"
SANDBOX_FAIL_CHANNELS=""

# Optional Reviewer Passcode (guards PATCH, approve, and publish routes; skipped if unset)
REVIEWER_PASSCODE=""

# n8n Automation (Optional — Local or Cloud)
# Uncomment only if you run n8n; otherwise the app uses the built-in direct pipeline.
#
# Option A — Local n8n (http://localhost:5678):
# N8N_BASE_URL="http://localhost:5678"
# N8N_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-ai-automation"
# N8N_CONTENT_WEBHOOK_URL="http://localhost:5678/webhook/impact-circles-content-publishing"
#
# Option B — n8n Cloud (https://your-instance.app.n8n.cloud):
# N8N_BASE_URL="https://your-instance.app.n8n.cloud"
# N8N_WEBHOOK_URL="https://your-instance.app.n8n.cloud/webhook/impact-circles-ai-automation"
# N8N_CONTENT_WEBHOOK_URL="https://your-instance.app.n8n.cloud/webhook/impact-circles-content-publishing"
#
# N8N_WEBHOOK_SECRET="your-webhook-shared-secret"
```

### 3. Initialize Database & Run

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. (Optional) Run with n8n — Local or n8n Cloud

The application functions completely out-of-the-box using the built-in direct pipeline without n8n. If you want visual orchestration:

#### Option A: Run Local n8n
1. Install and start n8n locally via npm or Docker:
   ```bash
   npx n8n
   # or with docker:
   # docker run -it --rm --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
   ```
2. Open `http://localhost:5678` in your browser.
3. In `.env`, uncomment the local n8n URLs (`http://localhost:5678/...`).

#### Option B: Connect to n8n Cloud
1. Create or log in to your [n8n Cloud](https://n8n.io/cloud/) workspace (e.g. `https://your-instance.app.n8n.cloud`).
2. In `.env`, set `N8N_BASE_URL`, `N8N_WEBHOOK_URL`, and `N8N_CONTENT_WEBHOOK_URL` to your cloud endpoints.

#### Import & Activate Workflows (Local or Cloud)
1. In n8n, navigate to **Workflows** → **Import from File**:
   - Import `n8n/workflows/finance-processing.json`
   - Import `n8n/workflows/content-publishing.json`
2. Configure Credentials:
   - **Neon Postgres**: Create a Postgres credential pointing to your Neon database URL (Host, Database, User, Password, Port 5432, SSL `require`).
   - **Google Gemini API**: Create a Gemini API credential using your `GEMINI_API_KEY`.
3. Set `N8N_WEBHOOK_SECRET` in your n8n environment variables to match your `.env`.
4. Toggle both workflows to **Active**. Next.js will automatically delegate tasks to n8n, falling back to the direct pipeline if n8n is ever offline.

---

## 5-Minute Demo Script

### Part 1: Finance Ingestion & Validation
1. **Upload Valid Invoice**: On the Finance tab, drag and drop `test-fixtures/fictional-invoice.pdf`. Observe Gemini extraction, automatic status `auto_approved`, subtotal/tax reconciliation, and ledger display.
2. **Duplicate Detection**: Upload the same file again. The system detects matching vendor, invoice number, amount, and currency, assigning status `duplicate_suspected` without corrupting totals.
3. **Missing Fields**: Upload `test-fixtures/fictional-missing-fields-invoice.pdf`. The system assigns status `needs_review` and flags missing fields.
4. **Category Breakdown**: View the breakdown table grouped strictly by category and currency (zero cross-currency addition).
5. **CSV Export**: Click "Export CSV" to download the RFC 4180 compliant expense file.

### Part 2: Content Generation, Human Review & Sandbox Publishing
1. **Generate**: Switch to "Content Agent" tab. Enter an announcement prompt (e.g., *"Community solar research paper findings"*) and click "Generate Multi-Channel Content".
2. **Human Approval Enforcement**: Attempting to publish before approval returns `400 Bad Request`.
3. **Review & Passcode**: Click "Review & Approve". If `REVIEWER_PASSCODE` is set, enter the passcode when prompted (persisted in `sessionStorage`).
4. **Reset on Edit**: Edit any channel copy. Notice the status reverts to `in_review`, requiring re-approval before publishing.
5. **Sandbox Dispatch**: Approve and click "Publish to Sandbox". Real HTTP calls dispatch each channel to the mock platform API.
6. **Live Preview**: Click the returned sandbox URLs to view the published output on `/sandbox/news/[slug]`, `/sandbox/linkedin/[id]`, or `/sandbox/newsletter/[id]`.
7. **Failure Simulation & Retry**: Set `SANDBOX_FAIL_CHANNELS="linkedin"` in `.env`, trigger publish on a new post to observe `partially_published`, then clear the variable and click "Retry Failed Channels" to dispatch only the failed channel.

---

## How This Connects to Production

| Channel | Sandbox Implementation | Production Integration Path |
| :--- | :--- | :--- |
| **Website CMS** | `POST /api/sandbox/cms/posts` | WordPress REST API (`POST /wp-json/wp/v2/posts`) using Application Passwords or OAuth 2.0 Bearer tokens, or headless CMS webhook (Contentful, Strapi). |
| **LinkedIn** | `POST /api/sandbox/linkedin/posts` | LinkedIn Posts API (`POST https://api.linkedin.com/rest/posts`) authenticated via 3-legged OAuth 2.0 with `w_member_social` or `w_organization_social` scope. |
| **Newsletter** | `POST /api/sandbox/newsletter/send` | Email Service Provider APIs such as Mailchimp Campaigns API (`POST /3.0/campaigns`) or Brevo/Sendinblue Transactional API (`POST /v3/smtp/email`). |

---

## Limitations

- **Sandbox Publishing**: Uses local mock API endpoints and `/sandbox/*` public viewers to demonstrate end-to-end publishing without requiring live social media credentials.
- **Passcode Authentication**: Uses constant-time header comparison (`x-reviewer-passcode`) for simple reviewer authorization rather than a full multi-tenant OAuth/OIDC identity system.
- **Single-Tenant Schema**: Designed as a focused assessment vertical slice rather than a multi-organization SaaS architecture.
- **API Rate Limits**: Subject to Google Gemini API quota limits (default configured model: `gemini-flash-latest`).
- **Automation Runner**: If N8N_WEBHOOK_URL is unset, the app uses the built-in direct pipeline.

---

## Sample Outputs Directory (`sample-outputs/`)

Sample records modeled on the test fixtures, produced by npm run export:samples:

- `sample-outputs/expenses.csv` — RFC 4180 CSV export of ingested invoices.
- `sample-outputs/finance-summary.json` — Structured totals grouped by currency and category.
- `sample-outputs/finance-summary.md` — Markdown summary report of financial metrics.
- `sample-outputs/generated-content.json` — Full 3-channel content package (CMS markdown, LinkedIn post, newsletter).
- `sample-outputs/publication-log.json` — Audit trail of sandbox publishing runs with live URLs and channel statuses.

---

## Quality Verification

Run the test suite and quality gates:

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Automated unit tests (89 passing tests across 12 suites)
npm test

# Production build verification
npm run build
```
