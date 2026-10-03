---
name: kickoff-project
description: Initialize a new project from this template. Sets up context, confirms structure, and prepares the workspace for real work.
---

# Kickoff Project

Run this skill at the start of any new project to establish shared context and confirm the workspace is ready.

## Steps

1. **Read the brief**
   - Check `docs/briefs/` for any existing brief files
   - If none exist, ask the user to describe the project goal in 2–3 sentences
   - Restate the goal back to confirm understanding

2. **Confirm the structure**
   - Verify that the key folders exist: `docs/`, `assets/`, `deliverables/`
   - Note any folders that are missing and create them if needed

3. **Establish the working context**
   - Write a short project summary to `notes.md` covering:
     - What the project is
     - What success looks like
     - Key constraints or unknowns

4. **Update the README**
   - Replace the template placeholder content in `README.md` with the actual project name and a one-paragraph description

5. **Confirm readiness**
   - Tell the user what was set up
   - Suggest the next logical action (e.g. "Run /planner to break down the first task")
