---
prd: "16"
title: "Admin Role & Auth Gate"
phase: 4
depends_on: ["phase-3"]
estimated_effort: "3 hours"
status: done
---

# PRD-16: Admin Role & Auth Gate

## Overview

Add a `role` column to the users table and create an admin-only route group so that designated operators can access admin pages. Regular users continue to see only their own dashboard. This is the foundation for all admin console features.

## Tasks

### Task 1: Add role column to Drizzle schema
##### MODIFY: src/lib/db/schema.ts

Add `role` field to the `users` table definition:

```typescript
role: text("role").notNull().default("user"),
```

Place it after `passwordHash` and before `createdAt`.

**Acceptance:** `users` table type includes `role: string`.

### Task 2: Update bootstrap SQL with role column + migration
##### MODIFY: src/lib/db/index.ts

1. Add `role TEXT NOT NULL DEFAULT 'user'` to the `CREATE TABLE IF NOT EXISTS users` statement.
2. After the existing `CREATE TABLE` block, add an idempotent migration for existing databases:

```sql
-- Migration: add role column to existing users table
BEGIN;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
COMMIT;
```

Wrap in try/catch since `ALTER TABLE ADD COLUMN` throws if column already exists.

**Acceptance:** Fresh DB has `role` column. Existing DB gets `role` column added without error.

### Task 3: Propagate role through NextAuth JWT and session
##### MODIFY: src/auth.ts

1. In `authorize()`: fetch `row.role` from DB and include it in the returned user object: `{ id: row.id, email: row.email, role: row.role }`.
2. In `jwt()` callback: `if (user) { token.role = (user as any).role; }`.
3. In `session()` callback: `session.user.role = token.role as string;`.

**Acceptance:** After sign-in, `session.user.role` is `"user"` or `"admin"`.

### Task 4: Update NextAuth type declarations
##### MODIFY: src/types/next-auth.d.ts

Extend `Session["user"]` to include `role: string`. Extend `JWT` to include `role?: string`.

**Acceptance:** TypeScript compiles with `session.user.role` access without type errors.

### Task 5: Create admin guard helper
##### CREATE: src/lib/admin-guard.ts

Export `assertAdmin(session)` that:
- Returns `true` if `session?.user?.role === "admin"`
- Returns `false` otherwise

Also export `assertAdminOrThrow(session)` for API routes that returns a `NextResponse` with 403 if not admin, or `null` if authorized.

**Acceptance:** Non-admin session returns false / 403. Admin session returns true / null.

### Task 6: Create (admin) route group layout
##### CREATE: src/app/(admin)/layout.tsx

Server component that:
1. Calls `auth()` to get session
2. If no session, redirects to `/signin`
3. If session but `role !== "admin"`, redirects to `/dashboard`
4. Otherwise renders children

Follow the same pattern as `src/app/(protected)/layout.tsx`.

**Acceptance:** Admin user sees admin pages. Regular user gets redirected to `/dashboard`. Unauthenticated user goes to `/signin`.

### Task 7: Create admin seed script
##### CREATE: infra/scripts/seed-admin.ts

Bun CLI script: `bun run infra/scripts/seed-admin.ts <email>`

1. Takes email as first CLI argument
2. Opens the DB
3. Updates the user's `role` to `"admin"` where `email` matches
4. Prints success or "user not found" error

**Acceptance:** Running `bun run infra/scripts/seed-admin.ts admin@example.com` sets that user's role to admin in the DB.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1    | done   | 2026-03-25 | src/lib/db/schema.ts | Added `role` field to users table |
| 2    | done   | 2026-03-25 | src/lib/db/index.ts | Added role to CREATE TABLE + idempotent ALTER TABLE migration |
| 3    | done   | 2026-03-25 | src/auth.ts | role in authorize return, jwt callback, session callback |
| 4    | done   | 2026-03-25 | src/types/next-auth.d.ts | Extended Session and JWT types with role |
| 5    | done   | 2026-03-25 | src/lib/admin-guard.ts | Created assertAdmin() and assertAdminOrThrow() |
| 6    | done   | 2026-03-25 | src/app/(admin)/layout.tsx | Admin route group with session + role checks |
| 7    | done   | 2026-03-25 | infra/scripts/seed-admin.ts | CLI script to promote user to admin |

## Acceptance Criteria

- [x] Existing users get `role = 'user'` by default after migration
- [x] Admin user can access `(admin)` routes
- [x] Regular user hitting `(admin)` routes gets redirected to `/dashboard`
- [x] `session.user.role` is available in both server and client components
- [x] `seed-admin.ts` script works end-to-end
