# Process AI

Internal AI agent that interviews employees about how a business process works, compares what they say with SOPs, and stores the result as a structured, versioned process in a central **Process Library**. Pilot department: Procurement.

- Build plan: [docs/briefs/process-ai-build-plan.md](docs/briefs/process-ai-build-plan.md)
- Approved decisions: [docs/decisions/](docs/decisions/)

## Stack

pnpm monorepo · React + Vite + shadcn/ui · Fastify · PostgreSQL 17 + pgvector · Drizzle ORM · Docker (single image for Azure Container Apps).

```
apps/web          React SPA (full app + /chat proof-of-concept chat)
apps/api          Fastify API (serves the built SPA in production)
packages/agent    Channel-agnostic AI interview engine + LLM gateway (OpenAI / Azure OpenAI)
packages/knowledge  Document checks, parsing (PDF/DOCX/XLSX/TXT), chunking, storage, hybrid search
packages/diagram  Process map layout and rendering (web map, SVG and PDF exports)
packages/db       Drizzle schema, migrations, seed
packages/shared   zod schemas and types shared by web and api
```

## Prerequisites

- Node 22+
- pnpm 10 via corepack: `corepack enable --install-directory ~/.local/bin pnpm` (the repo pins `pnpm@10.34.6`)
- Docker Desktop running

## Run locally (development)

```bash
cp .env.example .env        # first time only
pnpm install
pnpm db:up                  # Postgres + pgvector on localhost:5433
pnpm db:migrate
pnpm db:seed                # Procurement department + dev users
pnpm dev                    # API on :3000, web on http://localhost:5173
```

Sign in by picking a seeded user (dev auth). Microsoft Entra ID replaces this in Phase 6.

## AI interviewer

Set these in `.env` (never commit it):

```
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_CHAT_MODEL=gpt-5.4-mini      # any model your key can use
LLM_EXTRACTION_MODEL=            # optional: a stronger model for structured extraction
```

Then map a process from **Interviews** (chat + live map) or the full-screen proof-of-concept chat at **/chat**.

No key? `pnpm --filter @process-ai/api dev:mock-ai` runs the API with a rule-based **mock** interviewer
(clearly marked "[Mock AI]") so you can work on the UI. Use it instead of the API in `pnpm dev`.

## Knowledge base (SOPs)

Admin → **Knowledge bases** → create one (e.g. "Procurement", linked to the department) → upload PDF, DOCX, XLSX or TXT files with a category.
Files are checked by content, stored under `STORAGE_DIR` (a Docker volume), then indexed in the background (pg-boss queue in Postgres):
text is split by section/sheet row, embedded with `LLM_EMBEDDING_MODEL`, and stored in pgvector. The interviewer retrieves relevant passages
each turn, records SOP rules as "From SOP", and asks about contradictions with a citation.

Note: every API instance connected to a database also runs its indexing worker, so all instances must share the same file store.

## Run the production image locally

```bash
pnpm docker:up              # builds the image and starts it with Postgres
open http://localhost:8080
```

The container runs migrations and the seed on start (`MIGRATE_ON_START`, `SEED_ON_START`). For Azure, push `process-ai:local` to Azure Container Registry and set the same env vars, with `AUTH_MODE=entra` once Phase 6 is done.

## Common commands

| Command             | What it does                                                            |
| ------------------- | ----------------------------------------------------------------------- |
| `pnpm typecheck`    | Type-check all packages                                                 |
| `pnpm lint`         | ESLint                                                                  |
| `pnpm test`         | Unit + integration tests (integration tests start a Postgres container) |
| `pnpm db:generate`  | Generate a migration from schema changes in `packages/db/src/schema`    |
| `pnpm db:migrate`   | Apply migrations                                                        |
| `pnpm docker:build` | Build the production image                                              |

## Configuration

All configuration is via environment variables, validated at startup — see [.env.example](.env.example). Never commit `.env`.
