# Project Overview

This is a reusable blank project template designed to work well with Claude Code from day one. It includes a curated set of agents, skills, and rules to give any project a solid starting foundation.

## Purpose

- Provide a clean, opinionated starting structure for new projects
- Reduce setup friction by pre-configuring Claude's behavior
- Keep work organized across docs, decisions, and deliverables

## How to Use This Template

1. Copy this folder and rename it to your project name
2. Open it in VS Code and start Claude Code
3. Run `/kickoff-project` to initialize your project context
4. Update `README.md` and `docs/briefs/` with your actual project brief

## Guiding Principles

- Keep structure clean, flat, and easy to navigate
- Prefer small, safe, reversible changes
- Document important decisions in `docs/decisions/`
- Keep work visible — use `notes.md` for in-progress thinking

## Directory Guide

| Folder | Purpose |
|---|---|
| `.claude/` | Claude configuration, agents, skills, rules |
| `docs/briefs/` | Project briefs and background context |
| `docs/notes/` | Research notes and reference material |
| `docs/decisions/` | Architectural and design decisions (ADRs) |
| `assets/` | Images, icons, raw input files |
| `deliverables/` | Final outputs ready to share or ship |
