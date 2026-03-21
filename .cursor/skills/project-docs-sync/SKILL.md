---
name: project-docs-sync
description: Run after a milestone-sized change or before pushing main—sync phases, README, and decisions. Use when the user ships a feature, changes extensions/setup, or asks to update project docs.
---

# Project docs sync (lightweight)

**Goal:** Keep human-facing docs honest without long essays. Touch only files that the change actually affects.

| If this changed… | Update… |
|------------------|---------|
| Milestone / release-sized work | `docs/phases.md` — one dated phase, short bullets |
| Durable design choice | `docs/decisions.md` — one entry (~Context / Decision / Rationale) |
| Assistant setup, extensions, or `.env` surface | `mercury-assistant/README.md` — tables/sections that users read first |

**Skip** for typo fixes, refactors with no behavior change, or internal-only edits.

**Do not** paste this skill into replies verbatim; apply the checklist and edit files.

Pairing rule (optional context): `.cursor/rules/project-docs-sync.mdc` — same checklist, `alwaysApply: false`.
