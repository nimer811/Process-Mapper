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

**Next:** Phase 2 — AI interview engine (web)

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
