---
name: mercury-development
description: Guides development of Mercury framework — extensions, API routes, container changes. Use when working on Mercury extensions, API routes, container-runner, mrctl commands, or pi agent integration.
---

# Mercury Development

## Quick Reference

- **Extensions**: `.mercury/extensions/<name>/` — see [mercury-fork/docs/extensions.md](mercury-fork/docs/extensions.md)
- **API routes**: `mercury-fork/src/core/routes/*.ts` — Hono routers, use `getApiCtx`, `getAuth`, `checkPerm`
- **Container**: `mercury-fork/src/agent/container-runner.ts`, `container-entry.ts`

## Extension Setup Pattern

```typescript
import type { MercuryExtensionAPI } from "mercury-ai";

export default function(mercury: MercuryExtensionAPI) {
  mercury.cli({ name: "my-tool", install: "bun add -g my-tool" });
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.skill("./skill");
  mercury.env({ from: "MERCURY_MY_API_KEY" });
  mercury.config("enabled", { description: "...", default: "true" });
  mercury.on("workspace_init", async ({ workspace, containerWorkspace }) => { /* ... */ });
  mercury.job("sync", { interval: 3600_000, run: async (ctx) => { /* ... */ } });
}
```

## API Route Pattern

1. Import Hono, `checkPerm`, `getApiCtx`, `getAuth` from `../api-types.js`
2. Create router: `export const myRoute = new Hono<Env>();`
3. Use `getAuth(c)` for `spaceId`, `callerId`
4. Use `checkPerm(c, "permission.name")` — return early if denied
5. Use `getApiCtx(c)` for `db`, `configRegistry`, etc.
6. Mount in `core/api.ts`

## Running Mercury

| Scenario | Command |
|----------|---------|
| Production / background | `mercury service install` |
| Stop cleanly | `mercury service uninstall` |
| Dev / one-off test | `mercury run` (blocks terminal) |
| After changing extensions or .env | `mercury service install` (rebuilds derived image if needed) |

Do **not** run `mercury build` for normal development — the derived Docker image is built automatically on startup.

## Pi Agent Skills vs Cursor Skills

- **mercury-fork/resources/skills/** — pi agent skills (inside containers). Format: SKILL.md with YAML frontmatter, used by mrctl.
- **.cursor/skills/** — Cursor IDE skills. For development workflows in the editor.

## Additional Resources

- Full extension API: [mercury-fork/docs/extensions.md](mercury-fork/docs/extensions.md)
- Architecture: [mercury-fork/CLAUDE.md](mercury-fork/CLAUDE.md)
- Container lifecycle: [mercury-fork/docs/container-lifecycle.md](mercury-fork/docs/container-lifecycle.md)
