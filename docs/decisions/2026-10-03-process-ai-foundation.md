# Decision: Process AI foundation — stack, scope and pilot setup

Date: 2026-10-03
Status: Decided

## Context
The build plan (`docs/briefs/process-ai-build-plan.md`) listed 10 decisions needing approval before implementation.

## Options Considered
See §2, §11 and "Decisions that need your approval" in the build plan.

## Decision
1. **Stack approved**: pnpm monorepo, Vite + React + TS, Fastify, PostgreSQL 17 + pgvector, Drizzle, pg-boss, Vercel AI SDK behind an `LlmGateway`, React Flow + ELK.
   - TypeScript pinned to 6.0 (typescript-eslint does not support TS 7 yet). pnpm pinned to 10.x (local corepack can't run pnpm 12).
2. **UI library**: shadcn/ui + Tailwind.
3. **Lifecycle keeps a separate admin Approved step**: Draft → Under Validation → Validated (process owner) → Approved (admin) → Archived. "AI Generated" is provenance, not a state.
4. **Roles**: `user` and `admin` stored in our DB, plus per-process owner. Reviewer deferred.
5. **Teams is Phase 7**, after the web pilot.
6. **LLM**: Azure OpenAI is the target. For now, use a temporary configuration with the owner's own LLM API key, set through env vars. Provider is a config value, not code.
7. **To-Be generation deferred**; MVP shows issues and automation opportunities only.
8. **Hosting**: run fully dockerised on the local machine (docker compose). The app builds as one image (API + built SPA) ready to push to Azure Container Registry / Azure Container Apps.
9. **Knowledge bases**: real SOPs will be provided. Admin area gets a Knowledge section where an admin creates a knowledge base container (e.g. "Procurement", optionally linked to a department), uploads documents into it with a category (SOP, policy, DoA, approval matrix, form, checklist, other), and the system extracts, chunks and vectorises them for retrieval.
10. **Environment setup approved**: git initialised, pnpm enabled, Docker used for Postgres.

## Consequences
- Schema adds `knowledge_bases`; documents belong to a knowledge base and carry a `category`.
- `version_status` includes `approved`; admin-only transition from `validated` to `approved`.
- Embeddings require a provider that offers an embeddings API; if the temporary key is for a provider without one, a separate embeddings key is needed.

## Follow-up (2026-10-03)
- **Temporary LLM provider: OpenAI API** (`LLM_PROVIDER=openai`), used for both chat and embeddings. Azure OpenAI remains the target; switching is configuration only.
- **No Azure/Entra IT requests for the pilot.** The pilot runs on the local Docker setup with dev sign-in. Consequence: dev sign-in lets anyone who can reach the app choose any user, so the pilot must stay on a trusted machine/network until Entra ID (Phase 6) is in place.
