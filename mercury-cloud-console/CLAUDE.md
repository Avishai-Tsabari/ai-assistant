# Mercury Cloud Console — Agent Instructions

Admin console and control plane for provisioning and managing Mercury agents.

## Commands

```bash
bun run dev          # Next.js dev server (Turbopack, port 3131)
bun run build        # Production build
bun run typecheck    # TypeScript check (no test suite yet)
bun run db:push      # Push Drizzle schema to SQLite
bun run provision    # Run agent provisioning script
bun run set-admin    # Seed an admin user
bun run health-check # Check provisioned agent health
```

## Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Auth**: NextAuth 5 (beta) — session-based, email/password
- **Database**: SQLite via better-sqlite3 + Drizzle ORM
- **Validation**: Zod for request bodies
- **Payments**: Stripe (optional)

## Structure

```
src/app/
├── (admin)/          # Admin-only pages (agent management)
├── (protected)/      # Auth-required pages (dashboard, onboarding)
├── api/              # Route handlers
│   ├── admin/        # Admin API routes
│   └── user/         # User API routes
├── auth/             # Auth pages (signin, signup)
└── catalog/          # Extension catalog

src/lib/
├── db/schema.ts      # Drizzle table definitions (source of truth)
├── db/index.ts       # Database queries and connection
├── admin-guard.ts    # Auth helpers: assertAdmin, assertAdminOrThrow, assertUserOrThrow
├── provisioner.ts    # Agent provisioning logic
├── encryption.ts     # AES-GCM encryption for stored secrets
├── env-renderer.ts   # Template rendering for mercury.env
└── providers.ts      # AI provider key management
```

## Conventions

- **API routes**: Use `assertAdminOrThrow()` or `assertUserOrThrow()` from `admin-guard.ts` at the top of every route handler
- **DB changes**: Edit `src/lib/db/schema.ts` first, then run `bun run db:push`
- **Request validation**: Parse request bodies with Zod schemas before use
- **Environment**: Key vars are `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `CONSOLE_ENCRYPTION_MASTER_KEY`
- **Port**: Dev server runs on 3131 (not default 3000)
