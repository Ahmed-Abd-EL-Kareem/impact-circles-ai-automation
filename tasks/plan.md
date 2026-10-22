# Implementation Plan: Phase 3 — AI Content Generation & Publishing Agent

## Overview
Phase 3 builds the AI Content Generation & Publishing Agent for Impact Circles as specified in the official Technical Assessment (`Part 2: AI Content Generation & Automated Publishing Agent`). It enables team members to input research project descriptions or event announcements, automatically generates three channel-tailored formats (LinkedIn Post, Newsletter Summary, Website Announcement) using Google Gemini, provides an interactive Human-in-the-Loop approval and editing interface, enforces that publication never occurs without explicit human approval (and re-approval on edit), and executes automated publishing to selected channels with audit logging and published URL tracking.

## Architecture Decisions
1. **Database Schema (Neon PostgreSQL + Prisma 7)**:
   - Add `ContentPost` and `PublishingLog` models to `prisma/schema.prisma`.
   - Fields:
     - `ContentPost`: `id`, `title`, `sourcePrompt`, `contentType` (`research_update`, `event_announcement`, `project_findings`), `status` (`draft`, `in_review`, `approved`, `published`, `partially_published`, `failed`), `linkedinContent`, `newsletterContent`, `websiteContent`, `targetChannels` (JSON array: `["linkedin", "newsletter", "website"]`), `metadata` (JSON), `approvedAt`, `publishedAt`, `createdAt`, `updatedAt`.
     - `PublishingLog`: `id`, `postId`, `channel` (`linkedin`, `newsletter`, `website`), `status` (`success`, `failed`, `simulated`), `publishedUrl`, `responsePayload` (JSON), `errorMessage`, `createdAt`.
   - Keep migration cleanly versioned (`prisma/migrations/20261021200000_add_content_publishing`).
2. **AI Generation Engine (`src/lib/content/gemini-content.ts`)**:
   - Reuses existing `GEMINI_API_KEY` and `GEMINI_MODEL` (`gemini-flash-latest` / `gemini-3.1-flash-lite`).
   - Structured JSON output with strict prompt instructions adapting tone, length, hashtags, and formatting for LinkedIn, Newsletter, and Website.
3. **Publishing Service & Multi-Channel Dispatcher (`src/lib/services/publishing.ts`)**:
   - Supports pluggable channel dispatchers:
     - `website`: WordPress REST API / local CMS API / mock publishing endpoint with realistic published URL generation.
     - `linkedin`: LinkedIn API / webhook endpoint.
     - `newsletter`: Newsletter / webhook endpoint.
   - Enforces human approval invariant: if `status !== 'approved'`, publishing is strictly rejected with HTTP 400.
   - Enforces re-approval on edit: any content change resets status to `in_review` and clears prior `approvedAt`.
4. **API Routes**:
   - `POST /api/content/generate`: Receives project description/topic, calls Gemini, returns structured 3-part content, saves as `draft`.
   - `GET /api/content`: Lists content posts with filtering by status and channel.
   - `GET /api/content/[id]`: Returns a single post and its publishing history.
   - `PATCH /api/content/[id]`: Updates content or channels, automatically resetting approval if modified.
   - `POST /api/content/[id]/approve`: Explicit human approval endpoint setting status to `approved`.
   - `POST /api/content/[id]/publish`: Executes automated publishing to selected channels, logs results to `PublishingLog`, updates status to `published` (or `partially_published` / `failed`).
5. **UI Integration (`src/components/content/` & Navigation)**:
   - Header tab switcher: "Finance Ingestion (Phase 2)" and "Content Publishing (Phase 3)".
   - Creation drawer / form: Input research update, select topic/tone, trigger AI generation.
   - Review & Approval modal: Three-tab preview (LinkedIn, Newsletter, Website), inline editable textareas, channel selection checkboxes, "Approve", "Save Edits", and "Approve & Publish" action buttons.
   - Post list with live status badges (`Draft`, `Approved`, `Published`, `Failed`) and published URL links.
   - Zero disruption to Phase 2 finance components or tests.

## Task List

### Task 1: Database Schema & Migration for Content Publishing
- Add `ContentPost` and `PublishingLog` models to `prisma/schema.prisma`.
- Run Prisma migration (`npx prisma migrate dev` or `deploy`).
- Update Prisma client (`npx prisma generate`).

### Task 2: AI Generation Service & Structured Contracts
- Define TypeScript types in `src/lib/types/content.ts`.
- Implement `generateContentWithGemini` in `src/lib/content/gemini-content.ts`.
- Add unit tests for generation validation and channel prompt schemas.

### Task 3: Content CRUD & Approval Workflow API Routes
- Implement `POST /api/content/generate` and `GET /api/content`.
- Implement `GET /api/content/[id]`, `PATCH /api/content/[id]`, `POST /api/content/[id]/approve`.
- Enforce re-approval invariant upon content modifications.

### Task 4: Automated Publishing Engine & Channel Dispatchers
- Implement `src/lib/services/publishing.ts` with multi-channel publishing handlers (Website CMS, LinkedIn, Newsletter) supporting production API tokens or configured mock/sandbox endpoints.
- Implement `POST /api/content/[id]/publish`.
- Record publication status, timestamps, and published URLs in `PublishingLog`.
- Add unit tests for approval-guardrail enforcement, failure handling, and retry logging.

### Task 5: Content Dashboard UI & Seamless Phase 2/3 Navigation
- Update `Header.tsx` with top-level tabs for "Financial Documents" and "Content Agent".
- Build `ContentAgentView.tsx` with generation form, review/edit cards, channel selectors, and approval action controls.
- Connect UI to API routes with optimistic updates, loading spinners, and error alerts.

### Task 6: Testing & End-to-End Verification
- Run existing Phase 1 & 2 unit tests (`npm test`) — all tests continue to pass without regression.
- Update Phase 3 unit tests (`tests/unit/content-generation.test.ts`, `tests/unit/publishing-workflow.test.ts`) to test actual validator and publishing functions.
- Verify 70 unit tests pass across 9 test suites.
- Verify build (`npm run build`), lint (`npm run lint`), TypeScript (`npx tsc --noEmit`), and Prisma schema validation (`npx prisma validate`).
- Document all environment variables, test procedures, authoritative execution path, and honest sandbox publishing in `README.md`.
