# Mercury Monorepo — Agent Instructions

## Monorepo Overview

Three independent packages (no workspace links — each manages its own dependencies):

| Package | What | Stack |
|---------|------|-------|
| `mercury-fork/` | Core agent runtime — chat adapters, Docker containers, extensions | Bun, Hono, SQLite |
| `mercury-cloud-console/` | Admin console — provisioning, user auth, agent management | Next.js 15, React 19, Drizzle ORM |
| `mercury-assistant/` | Reference Mercury project (config only — no code changes here) | mercury.yaml + .env |

Each package has its own `CLAUDE.md` with package-specific details.

## Commands

Run from the relevant package directory:

```bash
# mercury-fork
cd mercury-fork && bun run check      # typecheck + lint + test (run before PR)
cd mercury-fork && bun run check:fix  # same but auto-fix lint issues

# mercury-cloud-console
cd mercury-cloud-console && bun run typecheck   # TypeScript only (no test suite yet)
cd mercury-cloud-console && bun run build       # Next.js production build
```

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

When entering plan mode for a new feature or task, first invoke the `product-planning` skill to create a PRD and feature spec before proceeding with implementation planning.
