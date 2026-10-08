# Process AI — Roadmap after the Procurement pilot build (Draft for approval)

Date: 2026-10-08
Status: Approved 2026-10-08 — decisions in `docs/decisions/2026-10-08-roadmap-decisions.md`. Phases A, B and C done.

## 1. Where we are

Built and working: Process Library and maps, AI interviewer (analyst-style, knowledge-base grounded, conversation guard), knowledge base with smart upload, validation and versioning with provenance, read-back of AI inferences and "Ask the interviewee", improvement analysis, To-Be design (step 1), process packs, PoC chat, Docker image.

Deferred so far: Entra ID and hardening (Phase 6), voice interviews, To-Be ownership design (step 2).

What's missing for real use is mostly **around** the interview: people aren't told when they need to act, a process can only come from one person, approved maps don't become SOPs, and processes aren't connected to each other.

## 2. Phases (recommended order)

Sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks of build time.

### Phase A — Housekeeping (S)
- Resolve the repo-wide reformat, commit and push the guard + read-back work, rebuild Docker.
- Admins see everyone's conversations in the Chats tab (read-only, with the person's name).
- **Done when:** main branch builds in Docker, all tests green, admin sees all chats.

### Phase B — "My actions" inbox and notifications (M)
Why first: the send-back loop and every later phase depend on people knowing they have something to do.
- New `tasks` table: who, what (confirm points, validate, approve, continue interview, give your view), link, status, due date.
- Tasks created by events: interview sent back → interviewee; draft submitted → process owner; validated → admin for approval; interview paused for 3+ days → interviewee (nudge).
- Inbox page and a badge in the sidebar; tasks close themselves when the action is done.
- Email notifications behind a provider setting (decision 1). In-app first; email can be switched on later.
- **Done when:** each lifecycle step creates a task for the right person and closes it when done; email sends when configured.

### Phase C — Several people, one process (L)
Why: real processes are known by several roles; one interview gives one view.
- Owner or admin invites a colleague to "add your view" on an existing process (creates a task from Phase B).
- The new interview starts from the existing map: the interviewer plays back the flow, focuses on that person's part, and asks about what's unknown.
- Every fact keeps who said it. When two people disagree (different order, owner, rule), it becomes a **disagreement** item, not a silent overwrite.
- Reconciliation view for the owner: side-by-side statements with quotes, pick one, or send a question to one of them.
- Process page shows contributors and what each confirmed.
- **Done when:** two interviews on one process produce one map, disagreements are listed with both sources, and the owner can settle each one.

### Phase D — SOP generation from approved maps (M)
Why: closes the loop interview → map → approval → official SOP.
- Generate a draft SOP (Word) from an approved version: purpose, scope, roles and responsibilities, RACI table, step-by-step procedure, business rules and controls, exceptions, KPIs, references, revision history.
- Uses the company's SOP template when provided (decision 2); otherwise a clean default.
- The owner reviews the draft; on publishing it is added to the knowledge base (category "SOP", linked to the process version), so future interviews and comparisons use it.
- **Done when:** an approved process downloads as a complete SOP in the template and appears in the knowledge base after publishing.

### Phase E — To-Be ownership design (step 2 of the engine upgrade) (M)
Builds on D's RACI.
- To-Be designs propose an accountable owner, step owners and a RACI table.
- Automatic checks after each design: segregation of duties (e.g. the same role creating and approving a supplier), delegation-of-authority limits, missing controls.
- Recommendations cite the knowledge base and a small, editable best-practice library (admin).
- **Done when:** a To-Be design shows a RACI, flags SoD/DoA conflicts, and every recommendation names its source.

### Phase F — Process architecture and coverage (M)
- Process levels (L1 value chain → L4 activity) using a taxonomy (decision 3).
- Links between processes: a step can hand off to another process (e.g. onboarding → PR to PO → invoice processing); end-to-end view across them.
- Coverage dashboard per department: expected processes vs mapped, validated, approved, overdue for review.
- **Done when:** the library can be browsed by level, an end-to-end flow across 3 Procurement processes is viewable, and the dashboard shows coverage.

### Phase G — Timings, volumes and value (M)
- The interviewer already asks timings; store them as numbers (duration, wait time, volume per month) as well as text.
- Per-process figures: estimated cycle time, waiting share, effort per month.
- Automation opportunities ranked by estimated hours saved, not only by impact/effort labels.
- **Done when:** a process shows its cycle time and the opportunities list is sorted by estimated value.

### Phase H — Arabic and bilingual interviews (M)
- Interview language chosen at start or detected; the interviewer replies in that language.
- The process model is stored in English (or both, decision 4) so the library stays consistent; original quotes are kept in the language spoken.
- Arabic SOPs in the knowledge base are searchable from English interviews and vice versa.
- **Done when:** a full interview in Arabic produces the same quality map as in English (checked with the evaluation script).

### Phase I — Review cycles and change detection (S)
- Each approved process gets a review date (default 12 months) and a task for the owner when due.
- When a knowledge-base document linked to a process is replaced or updated, the process is flagged "SOP changed — check".
- **Done when:** due reviews and changed SOPs appear on the owner's inbox and the dashboard.

### Phase J — Pilot hardening (the deferred Phase 6) (M)
- Sign-in with Microsoft Entra ID; roles from Entra groups.
- Transcript retention and deletion rules; export of a person's data.
- AI usage limits and a cost view per department.
- Interview evaluation runs automatically on every change (CI), with a minimum quality bar.
- **Done when:** real users sign in with Entra ID and the pilot checklist in the build plan is met.

### Phase K — Voice interviews (M)
As designed in `docs/decisions/2026-10-08-voice-interviews.md`. Placed last because it reuses everything above; can move earlier if spoken interviews are a pilot requirement.

## 3. Order at a glance

| # | Phase | Size | Depends on |
|---|---|---|---|
| A | Housekeeping | S | — |
| B | Inbox & notifications | M | A |
| C | Several people, one process | L | B |
| D | SOP generation | M | A |
| E | To-Be ownership design | M | D |
| F | Architecture & coverage | M | A |
| G | Timings & value | M | — |
| H | Arabic / bilingual | M | — |
| I | Review cycles | S | B |
| J | Pilot hardening | M | — (required before real users) |
| K | Voice | M | J if used by real users |

Suggested first release for real users: **A → B → C → D → J**. The rest can follow in any order based on pilot feedback.

## 4. Decisions needed

1. **Email channel** for notifications: Microsoft 365 (Graph, needs an app registration) or SMTP? Or in-app only for the pilot?
2. **SOP template**: do you have a company SOP template (Word) to generate into?
3. **Process taxonomy**: APQC Process Classification Framework, or the company's own process levels?
4. **Arabic scope**: interviews only, or also the interface (right-to-left)? Store the model in English only, or in both languages?
5. **Disagreements between interviewees**: always settled by the process owner, or can the AI settle low-risk ones (e.g. wording) on its own?
6. **Hardening timing**: is Entra ID needed before the first real Procurement users, or can the pilot start on the current sign-in inside the network?
