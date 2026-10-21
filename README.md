# Impact Circles — AI Automation: Financial Document Assistant (Phase 2)

A production-grade vertical slice for intelligent financial document ingestion, structured multimodal extraction, duplicate detection, and persistent expense management built with **Next.js App Router**, **Neon PostgreSQL**, **Prisma ORM**, **Google Gemini API**, and **n8n workflow orchestration**.

---

## Architecture & Processing Flow

```
[User Browser]
      │  (PDF / PNG / JPEG upload via Drag & Drop UI)
      ▼
[Next.js Server API: POST /api/invoices]
      │  1. Validates magic bytes (%PDF, PNG, JPEG) and 10MB bounds
      │  2. Dispatches payload + HMAC/shared secret header to n8n
      ▼
[n8n Automation Pipeline (Port 5678)]
      ├─ 1. Webhook Trigger (`POST /webhook/impact-circles-ai-automation`)
      ├─ 2. Validate Request & Shared Secret (`x-webhook-secret`)
      ├─ 3. Multimodal Extraction via Google Gemini (`gemini-flash-latest`)
      ├─ 4. Server-side Extraction Schema & Arithmetic Sanity Validation
      ├─ 5. Duplicate Detection Query against Neon PostgreSQL
      ├─ 6. Single-Ownership Persistence (INSERT INTO "Expense")
      └─ 7. Respond to Webhook with 201 Created + Persisted Record
      │
      ▼
[Next.js Client UI]
      └─ Displays updated expense table, validation badges & issue inspector modal
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
- `expenseDate` (DateTime nullable)
- `vendor` (String nullable)
- `invoiceNumber` (String nullable)
- `description` (String nullable)
- `amount` (Decimal 12,2 nullable)
- `currency` (String nullable)
- `taxAmount` (Decimal 12,2 nullable)
- `category` (String: personnel, travel, equipment, software, events, operational, uncategorized)
- `validationStatus` (String: valid, needs_review, duplicate_suspected, processing_failed)
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
# Set the environment variables in the terminal session
$env:N8N_WEBHOOK_SECRET="your-secure-random-secret-key"
$env:GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
$env:GEMINI_MODEL="gemini-flash-latest"

# Start n8n
npx n8n
```

n8n will start and be accessible at [http://localhost:5678](http://localhost:5678).

---

## 7. How to Import and Configure the Finance Workflow in n8n

1. Open your browser and navigate to `http://localhost:5678`.
2. In the left navigation, click **Workflows** → **Add Workflow** (or **Import from File**).
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
5. Ensure the workflow is **Activated** (toggle switch in the top right to **Active**).

---

## 8. Testing

### Run Unit Tests
A focused test suite covers magic-byte detection, extraction schema rules, arithmetic bounds, duplicate detection, and summary grouping:

```powershell
npm test
```

### Run End-to-End Integration Test
Runs a live end-to-end test against real Gemini and Neon PostgreSQL:

```powershell
node --env-file=.env scripts/test-integration.ts
```

This script:
1. Verifies connectivity to Neon PostgreSQL.
2. Reads the sample invoice fixture `test-fixtures/fictional-invoice.pdf`.
3. Calls Google Gemini to extract structured invoice data.
4. Validates the schema and arithmetic bounds.
5. Persists the expense to Neon PostgreSQL.
6. Submits a duplicate fixture to verify that duplicate detection flags `duplicate_suspected`.
7. Verifies currency grouping (strictly separated; no cross-currency summing).
8. Probes the local n8n webhook.
9. Automatically cleans up test records from the database.

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
   - A modal drawer displays the raw fields, missing values, and specific anomaly codes.
5. **Filters & Pagination**:
   - Filter by status (`valid`, `needs_review`, `duplicate_suspected`).
   - Filter by category (`software`, `operational`, etc.).
6. **Currency Volumes**:
   - Inspect the **Currency Volumes** card: amounts in USD, EUR, EGP are listed with individual totals, proving that no cross-currency additions occur.

---

## 10. Known Limitations & Notes

- **Offline n8n Graceful Handling**: If n8n is offline when an upload is attempted in the UI, the API returns a clear HTTP 503 explaining that the local n8n instance is offline, rather than failing silently or presenting a false success.
- **Model Choice**: Google Gemini deprecated `gemini-2.5-flash` for new users. The implementation uses `gemini-flash-latest` (or `gemini-3.1-flash-lite`), which supports multimodal PDF and image documents with structured JSON schema output.
- **Currency Conversion**: As specified in the Phase 2 requirements, cross-currency addition is strictly forbidden without real-time exchange rates. Volumes are displayed separately per currency code.
