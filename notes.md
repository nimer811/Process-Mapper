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

**Next:** Phase 3 — Knowledge base (KB containers + categories in Admin, upload, vectorise) and SOP grounding

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
