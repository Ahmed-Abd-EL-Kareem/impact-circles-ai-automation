# Phase 3 Todo Checklist

- [x] Task 1: Database Schema & Migration for Content Publishing
  - [x] Add `ContentPost` and `PublishingLog` models to `prisma/schema.prisma`
  - [x] Generate migration and apply to Neon PostgreSQL
  - [x] Run `npx prisma generate`
  - [x] Verify Prisma client types

- [x] Task 2: Domain Types & Gemini AI Content Generation Service
  - [x] Create `src/lib/types/content.ts` with channel and status types
  - [x] Implement `src/lib/content/gemini-content.ts` with structured prompt and channel adaptation
  - [x] Add validation utilities for generated content packages

- [x] Task 3: Content Management & Approval API Endpoints
  - [x] Create `src/app/api/content/route.ts` (list and generate)
  - [x] Create `src/app/api/content/[id]/route.ts` (get, update, delete)
  - [x] Create `src/app/api/content/[id]/approve/route.ts` (explicit human approval)
  - [x] Enforce invariant: edits after approval invalidate approval status

- [x] Task 4: Automated Multi-Channel Publishing Engine
  - [x] Implement `src/lib/services/publishing.ts` (Website CMS, LinkedIn, Newsletter)
  - [x] Create `src/app/api/content/[id]/publish/route.ts`
  - [x] Verify publishing rejects unapproved content
  - [x] Store publication status, published URLs, timestamps in `PublishingLog`

- [x] Task 5: UI Integration & Human-in-the-Loop Review Dashboard
  - [x] Add view switcher in `src/components/Header.tsx` (Financial vs Content Agent)
  - [x] Build `src/components/content/ContentAgentView.tsx`
  - [x] Build `src/components/content/ContentGeneratorForm.tsx`
  - [x] Build `src/components/content/ContentReviewModal.tsx`
  - [x] Integrate into `src/app/page.tsx` without breaking Phase 2

- [x] Task 6: Testing, Quality Gates & Documentation
  - [x] Run `npm test` to ensure all existing Phase 1 & 2 tests pass
  - [x] Remediate `tests/unit/content-generation.test.ts` to test real `validateGeneratedContentPackage`
  - [x] Remediate `tests/unit/publishing-workflow.test.ts` to test real `publishContentPost` and sandbox invariants
  - [x] Ensure 70 unit tests pass across 9 suites
  - [x] Run `npx tsc --noEmit` (0 errors)
  - [x] Run `npm run lint` (0 errors)
  - [x] Run `npm run build` (Turbopack exit 0)
  - [x] Update `README.md` clarifying Next.js API authoritative execution path and honest simulated statuses
