# Organization Rules

These rules keep the project easy to navigate and easy to hand off.

## File Naming

- Use lowercase, hyphen-separated names: `project-brief.md`, `final-report.pdf`
- Prefix draft files with `draft-` to distinguish from finals
- Prefix dated entries with `YYYY-MM-DD-` when order matters

## Folder Use

| Folder | What goes here | What does NOT go here |
|---|---|---|
| `docs/briefs/` | Project briefs, background docs | Deliverables or outputs |
| `docs/notes/` | Research, references, rough notes | Polished documents |
| `docs/decisions/` | Finalized decisions with rationale | Open questions (use `notes.md`) |
| `assets/` | Raw inputs: images, data files, source material | Processed outputs |
| `deliverables/` | Final outputs ready to share | Work in progress |

## Decision Records

When a significant decision is made, create a file in `docs/decisions/` using this format:

```
# Decision: [Short Title]

Date: YYYY-MM-DD
Status: Decided / Revisiting

## Context
Why this decision was needed.

## Options Considered
- Option A
- Option B

## Decision
What was decided and why.

## Consequences
What this means going forward.
```

## Notes

- Use `notes.md` in the root for active, in-progress thinking
- Move resolved notes to the appropriate `docs/` subfolder
- Keep `notes.md` trimmed — it should reflect current state, not history
