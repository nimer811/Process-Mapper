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

## 2026-10-08 — Conversation guard + confirming AI inferences in the interview

- Guard: every message is classified (process info / question about the interview / off topic / inappropriate / manipulation). Non-process messages record nothing, don't use up the turn budget, and get a calm redirect; after 3 in a row the interviewer offers to pause.
- Quality: duplicate rules dropped (same words and same figures), non-rules not saved as rules, role answers update the step they were about, analyst asks about timings/SLAs.
- AI inferences (steps, connections, rules) are read back to the employee as one question on playback turns and before the summary; a "yes" makes them stated, with evidence. Confirming the summary also confirms what it showed.
- Validation: "Ask the interviewee" on the review panel returns the version to draft and reopens the interview with the read-back (`POST /versions/:id/send-back`). The owner blocker shows the role the interview named as accountable.
- Phase A (roadmap) done: reformat committed separately (a38f608, revertable), work committed and pushed, Docker rebuilt, admins see everyone's chats (Everyone / Mine toggle in /chat).
- Roadmap decisions recorded in `docs/decisions/2026-10-08-roadmap-decisions.md` (in-app only, own SOP template, APQC, Arabic later, AI recommends / owner verifies, Entra later).
- Phase B done: "My actions" inbox (`tasks` table, migration 0007). Tasks open/close from lifecycle state: assign owner (admins), validate (owner), approve (admins), confirm points (interviewee, on send-back), nudge after 3 quiet days (dismissible). Sidebar badge + Home card. `Notifier` hook is a no-op until email is configured.
- Phase C done: several people, one process. Owner/admin invites a colleague (People card on the process page → "Invite a colleague", optional focus); the colleague gets an "Add your view" action and a short interview that starts from the map. Statements that contradict what someone else said (owner, timing, SLA, approver, removed step/connection, rule with different figures) are held as **disagreements** (code, not AI) instead of overwriting; refinements ("Procurement" → "Procurement Officer") still apply. The AI recommends keep / use / combine / ask, citing KB documents; the owner decides in "Review and decide" (or asks one of the two people in their interview). Open disagreements block validation and give the owner a "Settle N differences" action. A version is submitted only when everyone's interview is finished. Demo: `node apps/api/scripts/eval/live-demo-contribution.mjs .env <processId>`.
- Phase C follow-ups: when the owner is one of the two people, consider routing the decision to an admin; combine-both still needs a manual edit after "Use this".
- Phase D done: **controls** are their own record (ID like PRC-C-004 unique in the department, preventive/detective, manual/automated, frequency, owner, evidence, key flag, risk, linked steps and rule); the AI drafts the ones the map shows (inferred until confirmed; they block validation like other inferences). **SOP generation**: Word document from the map in our template (document control, purpose, scope, definitions, references, roles, RACI, diagram, numbered procedure, decisions, exceptions, control matrix, rules, KPIs/SLAs, records, risks, training, provenance, revision history, sign-off). AI writes wording only; owner edits purpose/roles/step instructions in the SOP tab, downloads Word, and publishes an approved version into the department KB (category SOP, linked to the process, indexed). Document IDs: `ORG_CODE` (7X in Docker) + department code + number, e.g. 7X-PRC-SOP-001.
- Procurement knowledge base linked to the Procurement department (2026-10-09).
- Phase E done: To-Be ownership design. The designer proposes the accountable process owner and a RACI per step (steps now store accountable/consulted/informed), grounded in the department's KB (DoA, roles) and the relevant **best practices** (Admin → Best practices; 12 seeded, editable, keyword-scoped). Every change cites its sources (unknown labels dropped). New **Ownership** tab: process owner, RACI table and automatic checks (code, not AI) on any version — segregation of duties (master data vs payment/bank verification, order/receive/pay, approving own work), delegation of authority (approval without authority; rule naming an approver no step uses), control gaps, ownership gaps. SOP RACI now uses A/C/I from the steps.
- Live run: Vendor Onboarding To-Be v1 (956ea95c…) — owner Procurement Lead, RACI for 8 steps, strategic-supplier approval routed to Head of Procurement, sources cite SOP-002 and the DoA appendix.
- (Resolved) the "Procurement" knowledge base wasn't linked to the Procurement department; SOPs fall back to a KB with the department's name, but link it in Admin so the process Documents tab sees it too.
- Running two API instances on one database (Docker + `pnpm dev`) lets either worker take indexing jobs; the other can't see the file. Run one at a time.
- SOP benchmark for Phase D: `docs/notes/sop-template-benchmark.md`. Open question from it: make controls their own entity (separate from business rules)?
- Open: `pnpm-lock 2.yaml` is a stray tracked duplicate of the lockfile — delete it from git?

## 2026-10-08 — Analyst interviewer (step 1 of the engine upgrade)

**Done:**

- Evaluation harness (`pnpm --filter @process-ai/api eval:interview`): simulated vague employee with a hidden true process (vendor onboarding, PR→PO), LLM judge, results in `apps/api/scripts/eval/results.jsonl` (git-ignored)
- Baseline: vendor onboarding stopped after 4 turns with 3/9 steps (the reported problem)
- Analyst pass every turn (`packages/agent/src/interview/analyst.ts`): flags missing steps, vague answers, unclear terms, needed detail, inconsistencies, implausible flows, SOP and leading-practice gaps → open questions with a reason; resolves what the answer addressed
- Leading-practice checklists (`checklists.ts`): vendor onboarding, PR→PO, tendering, invoice processing, generic — guide questions, never recorded as facts
- Ending: no summary just because questions ran out; depth gate (connected flow, ≥3 steps, every step owned, no unasked important questions) + analyst go-ahead; target ~24 turns, hard limit 35 with "Still to confirm"
- Playback every 5 turns; analyst gets an "already asked" list; interviewer may only cite retrieved documents; summary never mentions internal wording
- Hard timeouts on model calls (analyst 20 s, extraction 30 s); the interview continues if a call is late
- Voice provision: `voice` channel + spoken reply style; design note `docs/decisions/2026-10-08-voice-interviews.md`

**Still open:**

- Step 2: To-Be ownership design (RACI, segregation of duties), KB grounding with citations, editable best-practice library, post-design checks
- Note: my command sandbox intermittently blocks api.openai.com; evaluation runs need to run outside it (the app in Docker is unaffected)

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
