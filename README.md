# Process AI

Internal AI agent that interviews employees about how a business process works, compares what they say with SOPs, and stores the result as a structured, versioned process in a central **Process Library**. Pilot department: Procurement.

- Build plan: [docs/briefs/process-ai-build-plan.md](docs/briefs/process-ai-build-plan.md)
- Approved decisions: [docs/decisions/](docs/decisions/)

## Stack

pnpm monorepo · React + Vite + shadcn/ui · Fastify · PostgreSQL 17 + pgvector · Drizzle ORM · Docker (single image for Azure Container Apps).

```
apps/web          React SPA
apps/api          Fastify API (serves the built SPA in production)
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

## Run the production image locally

```bash
pnpm docker:up              # builds the image and starts it with Postgres
open http://localhost:8080
```

The container runs migrations and the seed on start (`MIGRATE_ON_START`, `SEED_ON_START`). For Azure, push `process-ai:local` to Azure Container Registry and set the same env vars, with `AUTH_MODE=entra` once Phase 6 is done.

## Common commands

| Command | What it does |
|---|---|
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit + integration tests (integration tests start a Postgres container) |
| `pnpm db:generate` | Generate a migration from schema changes in `packages/db/src/schema` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm docker:build` | Build the production image |

## Configuration

All configuration is via environment variables, validated at startup — see [.env.example](.env.example). Never commit `.env`.
