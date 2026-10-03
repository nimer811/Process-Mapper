# Notes

Active working notes for this project. Use this file for in-progress thinking, open questions, and session summaries.

Move resolved notes to `docs/notes/` or `docs/decisions/` once they are settled.

---

<!-- Add dated entries below. Example format:

## 2026-03-21 — Session Summary

**Done:**
- Initialized project from template

**Still open:**
- Add project brief to docs/briefs/

**Decisions made:**
- None yet

-->

## 2026-10-03 — Smart upload + To-Be design

**Done:**
- Smart bulk upload (Admin → Knowledge bases): drop up to 50 files; AI picks knowledge base, category, title, version, effective date (confidence + reason); low confidence / no fit → Inbox for review; duplicates rejected; filename rules if the AI call fails. KB upload card defaults to "Auto-detect"
- To-Be design: "Design To-Be" on the current As-Is → choose opportunities + goals → AI proposes typed changes (modify/add/remove steps, connections, rules) → applied to a To-Be draft with a change log (rationale + opportunity). As-Is vs To-Be tab with both maps highlighted (opens on first change); To-Be PDF pack includes the design section
- Migration `0005_smart_upload_and_to_be`
- Verified with the real model: correct filing of 4 mixed files; To-Be implemented 2 opportunities and kept the call-back and sanctions controls as instructed
- Tests: API 62, agent 24, knowledge 9, diagram 5, web 1

**Still open:**
- To-Be issues/automation tabs reuse the same analysis (works, but rarely needed on a To-Be)
- Phase 6 (Entra ID & hardening) deferred by decision

## 2026-10-03 — Phase 5 (Issues & automation opportunities)

**Done:**
- Migration `0004_improvement_analysis`: issues + automation_opportunities (source user/heuristic/ai/manual, status proposed/accepted/dismissed, stable keys)
- Rule checks (`packages/agent/src/analysis/heuristics.ts`): pain points → issues; no owner; approval without authority; unclear decision criteria; missing SLAs; rework loops; ≥4 handoffs; stacked approvals; opportunities for integration (re-keying), workflow (email/phone/Excel steps), AI review (not on steps with a control rule), upfront validation for rework loops
- AI analysis (on demand) proposes issues + opportunities tied to step keys; skips duplicates of rule findings; failures reported without losing rule checks
- Rule checks run automatically on validation; re-runs keep accept/dismiss decisions and never resurrect dismissed items
- Issues & Automation tabs (quick wins first), owner-added issues, markers on map nodes, findings in the step panel, accepted items in the PDF pack's Recommendations section
- Verified with the real model on Vendor Onboarding (7 grounded AI issues, sensible opportunities); demo data restored afterwards

**Still open:**
- To-Be process generation remains out of MVP scope (opportunities only)
- Findings aren't copied to new versions (re-run analysis on the new version)

**Next:** Phase 6 — Entra ID, admin & pilot hardening (deployment, security review, smoke tests)

## 2026-10-03 — Phase 4 (Validation, versioning & provenance)

**Done:**
- Lifecycle (rules in `apps/api/src/modules/governance/lifecycle.ts`): draft → under_validation (submit: interviewee/owner/admin) → validated (owner/admin) → approved (admin); return-to-draft needs a comment; archive whole process (admin)
- Validation is blocked by AI-inferred or disputed steps/connections/rules, open SOP contradictions, or no owner; owner confirms/removes/resolves from the Review panel. Validating confirms stated/documented content, makes the version current and archives the one it replaces
- Confirming an interview summary records `summary_confirmed` and submits the draft
- Owner editing via forms (metadata, steps, connections, rules) → provenance confirmed + `manual_edit` evidence + audit
- New version = copy of the current version (step keys, edges, rules, evidence); one open version per process; compare versions by step key
- Step panel "Where did this come from?" (quotes, who, when, SOP citation, link to interview)
- Home dashboard (awaiting my validation, interviews in progress, recently updated); Admin → Approvals; admins assign owners
- Tests: API 47 (incl. full lifecycle), agent 18, knowledge 9, diagram 5, web 1. Browser walkthrough on Docker passed; demo data restored afterwards

**Still open:**
- Interview-created processes have no owner until an admin assigns one (shown in Approvals)
- Follow-up interview on an existing process (to correct a returned draft) not built yet — edits are form-based


## 2026-10-03 — Phase 3 (Knowledge base & SOP grounding)

**Done:**
- Migration `0003_knowledge_base`: pgvector extension, knowledge_bases, documents (category, version, effective date, status), document_chunks (vector(1536) HNSW + full-text GIN); evidence/open items can cite a chunk
- `packages/knowledge`: content-based file checks (PDF/DOCX/XLSX/TXT, 25 MB, zip-bomb guard), structure-aware parsing (DOCX headings + table rows, XLSX rows with headers, PDF pages), chunking, local file store, hybrid search (vector + full-text, RRF)
- Indexing runs on pg-boss (Postgres queue) in the API process; status pending → processing → ready/failed
- Engine: top-5 SOP passages per turn; documented rules; contradictions cite the SOP; validator rejects citations not retrieved this turn
- Admin → Knowledge bases (create, upload, status, re-index, deactivate, delete, test search); Knowledge page for all users; Documents tab on processes; citation chips in chat
- SheetJS vendored at `vendor/xlsx-0.20.3.tgz` (official CDN build, SHA-512 recorded)
- Verified end to end in Docker with the real model: contradiction question cites "Procurement Policy, 4.2 Finance review"
- Fixed Docker packaging (externalised node_modules + hoisted deploy; pdfkit back in prod deps)

**Still open:**
- Upload the real Procurement SOPs and review retrieval with the test search
- Backlog: CI smoke test that builds and starts the Docker image (two packaging bugs only showed up there)
- OCR for scanned PDFs not supported (flagged as failed with a clear message)


## 2026-10-03 — Phase 2 (AI interview engine) + PoC chat

**Done:**
- `packages/agent`: channel-agnostic InterviewEngine. Per turn: extract typed ops (LLM) → validate in code (refs, duplicates, "stated" claims need a real quote or become "inferred") → apply in one transaction with evidence → deterministic gap analysis, stage rules, question selection (max 2) → reply streamed (LLM). Fallbacks if the model fails.
- State in Postgres (migration `0002_interviews`): sessions, messages, open items, LLM call log; bounded context (outline + open items + rolling summary + last 8 messages)
- API: start / list / detail / messages (SSE) / pause / resume (recap) / complete; admin sees all sessions read-only
- Web: Interviews list, interview workspace (chat + live map + open questions), Home "Map a process", Admin → Interview sessions
- **Plan change:** Teams removed from schedule → Phase 7 is a temporary PoC chat (`/chat`, built); production channel decided after the PoC (Phase 8)
- Dev-only mock interviewer: `pnpm --filter @process-ai/api dev:mock-ai`
- Tests: agent 17, API 29, diagram 5, web 1 — all green; browser-tested with the mock (desktop + mobile)

**Still open:**
- Add `LLM_API_KEY` to `.env` and run a real interview; tune prompts on real Procurement conversations
- Interview quality not yet evaluated against a real model (needs the key)


## 2026-10-03 — Phase 1 (Process Library & Map) complete

**Done:**
- Process schema (migration `0001_process_model`): processes, versions (draft → under_validation → validated → approved → archived), steps, typed edges, business rules, actors/systems catalogues, evidence, validation events
- Demo seed (`seedDemo`): approved branching Vendor Onboarding (15 steps, decision/approval/exception/loop-back) + draft PR-to-PO. Docker seeds it via `SEED_DEMO_ON_START` — set to `false` before loading real pilot data
- API: departments (admin create/edit with audit), processes list/search/filter, process detail, version graph; draft visibility limited to admin/owner/creator
- Web: Library, Department, Process Detail (header + 6 tabs), React Flow map with ELK layout and ELK-routed edges, step side panel, Details/Versions tabs, Admin → Departments
- Replaced next-themes with a small system-theme hook (React 19 script warning)
- Tests: 14 API + 4 web, all green; screenshots verified

**Still open:**
- Add OpenAI key to `.env` (`LLM_API_KEY`) before Phase 2
- Issues / Automation / Documents tabs are placeholders until Phases 5 / 5 / 3
- Map: swimlanes and BPMN export deferred

**Added after Phase 1 (user request): process packs**
- Download per process: PDF pack (cover/overview, map overview + tiled detail pages, steps, decisions/branches, rules, pain points, version history; DRAFT watermark when not validated) and standalone SVG map
- Bulk per department: ZIP with a folder per visible process (PDF + SVG) and `index.csv`
- Map rendering shared by web and API via `packages/diagram` (ELK layout → scene → SVG / pdfkit)
- Known limit: PDF uses built-in Helvetica, so Arabic text won't render until an Arabic font is embedded


## 2026-10-03 — Plan approved, Phase 0 (Foundation) complete

**Done:**
- Decisions recorded: `docs/decisions/2026-10-03-process-ai-foundation.md`; plan updated (admin Approved step, knowledge-base containers with categories)
- Monorepo scaffolded: `apps/api` (Fastify, dev auth, problem-details errors, /health, /ready, /api/v1/me), `apps/web` (Vite + shadcn/ui shell, dev login, sidebar nav, placeholder pages), `packages/db` (users, departments, audit_log + migration + seed), `packages/shared`
- Docker: `docker-compose.yml` (pgvector Postgres; `app` profile runs the prod image on :8080) and multi-stage `Dockerfile` (one image: API + SPA)
- Verified: typecheck, lint, 5 API integration tests (Testcontainers), dev stack via Vite proxy, production container end to end

**Still open:**
- Add OpenAI key to `.env` (`LLM_API_KEY`) before Phase 2
- Push to the user's "process mapper" GitHub repo — remote URL needed
- IT requests (Entra, Azure) not needed for the pilot; pilot uses dev sign-in on a trusted machine
- Authorize Microsoft Learn MCP connector

**Next:** Phase 1 — process schema, seeded branching Vendor Onboarding process, Process Library + Process Detail + React Flow map
