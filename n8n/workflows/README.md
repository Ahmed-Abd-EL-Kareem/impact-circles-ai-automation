# n8n Workflows

This directory contains the n8n orchestration workflows designed for Impact Circles AI Automation:

1. **`finance-processing.json` (Active Demo Workflow)**
   - Orchestrates multi-modal Gemini expense extraction, arithmetic validation, duplicate detection, and PostgreSQL persistence.
   - Primary webhook: `POST /webhook/impact-circles-ai-automation` with shared-secret authentication (`x-webhook-secret`).
   - If n8n is offline or `N8N_WEBHOOK_URL` is unset, the Next.js app falls back automatically to its direct pipeline (`src/lib/services/pipeline.ts`).

2. **`content-publishing.json` (Optional Reference Only)**
   - **Note:** This workflow is an optional reference pipeline showing how external webhook orchestration for multi-channel content generation could be offloaded to n8n.
   - **For this demo assessment**, content generation (Gemini) and sandbox publishing (WordPress/LinkedIn/Newsletter mock endpoints) are executed directly inside Next.js to provide synchronous feedback, human-in-the-loop review guards, and granular channel error reporting.
