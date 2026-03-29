# Mercury Monorepo — Agent Instructions

## Monorepo Overview

Three independent packages (no workspace links — each manages its own dependencies):

| Package | What | Stack |
|---------|------|-------|
| `mercury-fork/` | Core agent runtime — chat adapters, Docker containers, extensions | Bun, Hono, SQLite |
| `mercury-cloud-console/` | Admin console — provisioning, user auth, agent management | Next.js 15, React 19, Drizzle ORM |
| `mercury-assistant/` | Reference Mercury project (config only — no code changes here) | mercury.yaml + .env |

Each package has its own `CLAUDE.md` with package-specific details. Import them when working in that package:

- @mercury-fork/CLAUDE.md
- @mercury-cloud-console/CLAUDE.md

## Commands

Run from the relevant package directory:

```bash
# mercury-fork
cd mercury-fork && bun run check      # typecheck + lint + test
cd mercury-fork && bun run check:fix  # same but auto-fix lint issues

# mercury-cloud-console
cd mercury-cloud-console && bun run typecheck   # TypeScript only (no test suite yet)
cd mercury-cloud-console && bun run build       # Next.js production build
```

## Definition of Done

- **mercury-fork**: A task is complete only after `bun run check` passes with no errors.
- **mercury-cloud-console**: A task is complete only after `bun run typecheck` passes with no errors.

## Code Style

- **TypeScript strict mode** in all packages
- **Biome** for mercury-fork: 2-space indent, double quotes, semicolons always
- **Imports**: ES modules (`import/export`), never CommonJS

## Git Conventions

- **Commits**: `feat(scope):`, `fix(scope):`, `docs:`, `refactor:`, `chore:` — scope is `fork`, `console`, etc.
- **Branches**: `issue-<num>-<slug>` for GitHub issues

## Safety Rules

- **Never commit `.env` files** or secrets (API keys, tokens, passwords)
- **Never kill processes by port** (e.g. `lsof -ti:8787 | xargs kill`) — this can kill the agent itself
- **Never run `mercury run` directly** — use `mercury service install` for background execution

## Planning Workflow

When starting a new feature or non-trivial task:

1. **PRD** (what + why) — Invoke `product-planning` skill → outputs to `prds/`
   - Covers: problem statement, goals, user stories, acceptance criteria, out-of-scope
   - No file names, schemas, or implementation detail
2. **TDD** (how) — After PRD approval, invoke `product-planning` skill in TDD mode → outputs to `tdds/`
   - Covers: data models, API contracts, file/folder structure, implementation sequence, edge cases
3. **Implementation** — After TDD approval, begin coding

PRDs are stable. TDDs are mutable — update them if the design changes during implementation.
