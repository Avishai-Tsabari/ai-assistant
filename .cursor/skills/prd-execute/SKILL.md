---
name: prd-execute
description: >-
  Execute PRD tasks mechanically with no creative decisions. Use when implementing tasks
  from an approved PRD, following exact file change specifications, or building features
  that have been pre-specified for mercury-cloud-console.
---

# PRD Execute

## Before coding

1. Open the PRD file; it is the **source of truth**.
2. Confirm `status` is `approved` (or the user explicitly approved in chat).
3. Read **depends_on** PRDs if referenced.

## During execution

- Run tasks in order; respect file dependencies.
- After each task: update the **Execution Log** (status, ISO timestamp, files touched, notes).
- Run each task **Acceptance** check before moving on.
- If a task is ambiguous or the repo state does not match the PRD: **stop** and report; do not guess.

## After the PRD

- Mark PRD `status: done` when all **Acceptance Criteria** checkboxes are satisfied.
- Run project checks: `bun run typecheck` / `bun run lint` / tests as specified in the PRD or repo root.
