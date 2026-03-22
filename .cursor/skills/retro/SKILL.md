---
name: retro
description: >-
  Conduct a retrospective after executing PRDs. Use when a phase is complete, after testing
  deployed changes, or when reviewing what went right and wrong in an implementation cycle
  for mercury-cloud-console.
---

# Retro

## Steps

1. **Compare** PRD specs to what was built — list deviations and why they happened.
2. **Capture** — What worked, what failed, PRD gaps, surprises, time vs estimate.
3. **Write** `retrospective.md` in the phase folder (e.g. `mercury-cloud-console/prds/phase-1_manual-onboarding/retrospective.md`).
4. **Update docs** — If there are durable gotchas, update `mercury-cloud-console/prds/master-plan.md`, repo `AGENTS.md`, or `.cursor/rules/` as appropriate.
5. **Next phase** — Note inputs for the next PRD set (what to change in PRD-07+).

## Template (retrospective.md)

```markdown
# Phase N Retrospective
Date:
Participants:

## Summary
## What went well
## What did not
## PRD accuracy
## Action items
```
