---
name: prd-write
description: >-
  Write detailed PRDs with exact file changes, acceptance criteria, and dependency ordering.
  Use when creating PRD documents, specifying technical tasks, or breaking features into
  mechanical implementation steps for mercury-cloud-console or related repos.
---

# PRD Write

## Before writing

1. Read [mercury-cloud-console/prds/master-plan.md](mercury-cloud-console/prds/master-plan.md) for architecture, PRD index, and timeline.
2. Follow [.cursor/rules/prd-format.mdc](.cursor/rules/prd-format.mdc) for structure and frontmatter.

## Rules

- Break work into the smallest mechanical steps (imports, single functions, single files).
- Every task: **CREATE** / **MODIFY** / **DELETE** + exact path + **Acceptance** criteria.
- Do not leave design decisions to the executor — specify libraries, env var names, and API shapes.
- Set `depends_on` correctly; link upstream PRDs in the Overview if needed.
- Keep `status: draft` until the human approves; then set `approved`.

## Output location

- Sub-PRDs: `mercury-cloud-console/prds/phase-<n>_<slug>/prd-NN_title.md`
- Master plan edits: only when adding PRD links or timeline updates (coordinate with the human).
