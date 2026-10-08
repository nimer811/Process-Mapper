# Decision: Roadmap choices after the pilot build

Date: 2026-10-08
Status: Decided

## Context
The roadmap (`docs/briefs/draft-process-ai-roadmap.md`, section 4) listed six open choices before building the next phases.

## Options Considered
See the roadmap: email channel, SOP template source, process taxonomy, Arabic scope, settling disagreements between interviewees, timing of Entra ID.

## Decision
1. **Notifications:** in-app inbox now. Email is configured later behind a provider setting; nothing in Phase B depends on it.
2. **SOP template:** we design our own best-practice template, benchmarked against logistics leaders and the standards they work to (ISO 9001 7.5, ISO 28000, TAPA, GDP, SCOR). Research in `docs/notes/sop-template-benchmark.md`.
3. **Taxonomy:** APQC Process Classification Framework (cross-industry) for process levels.
4. **Arabic:** later.
5. **Disagreements between interviewees:** the AI recommends a resolution with its reasoning and sources; the process owner verifies (accepts, changes or asks one of the people).
6. **Entra ID and hardening:** later; the pilot continues on dev sign-in.

## Consequences
- Phase B builds an in-app task inbox with a notification hook that does nothing until an email provider is configured.
- Phase C's reconciliation view shows an AI recommendation per disagreement, never applied without the owner.
- Phase D generates into our own template; Phase F uses APQC levels.
