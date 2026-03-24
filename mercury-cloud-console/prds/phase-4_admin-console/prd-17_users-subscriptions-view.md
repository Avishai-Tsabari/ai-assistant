---
prd: "17"
title: "Users & Subscriptions View"
phase: 4
depends_on: ["16"]
estimated_effort: "4 hours"
status: done
---

# PRD-17: Users & Subscriptions View

## Overview

Create the admin landing page and users list so the operator can see all registered users, their subscription status, and agent counts at a glance. Includes admin navigation layout shared by all admin pages.

## Tasks

### Task 1: Admin API -- list all users
##### CREATE: src/app/api/admin/users/route.ts

GET handler:
1. Check session with `assertAdminOrThrow`
2. Query all users joined with subscriptions (left join) and agent count
3. Return `{ users: [{ id, email, role, createdAt, subscription: { status, stripeCustomerId } | null, agentCount }] }`

**Acceptance:** Returns all users with correct subscription and agent data. Non-admin gets 403.

### Task 2: Admin navigation layout
##### CREATE: src/app/(admin)/admin/layout.tsx

Nested layout with:
- Admin header/title: "Admin Console"
- Nav links: Overview (`/admin`), Users (`/admin/users`), Agents (`/admin/agents`), Health (`/admin/health`)
- "Back to Dashboard" link to `/dashboard`
- Active link highlighting

**Acceptance:** Navigation renders on all admin pages. Links work.

### Task 3: Admin overview page
##### CREATE: src/app/(admin)/admin/page.tsx

Server component showing summary cards:
- Total users count
- Total agents count
- Active subscriptions count
- Quick links to Users and Agents pages

Query DB directly (server component, no API call needed).

**Acceptance:** Cards show correct counts from the database.

### Task 4: Users list page
##### CREATE: src/app/(admin)/admin/users/page.tsx

Server component with a table:
- Columns: Email, Role, Signed Up, Subscription Status, Agent Count
- Sort by signup date (newest first)
- Role shown as badge (admin/user)
- Subscription status: active (green), inactive (gray), none (dash)

Query DB directly with Drizzle left join on subscriptions + agent count subquery.

**Acceptance:** All users visible. Subscription status and agent count correct per user.

## Execution Log

| Task | Status | Timestamp | Files Touched | Notes |
|------|--------|-----------|---------------|-------|
| 1    | done   | 2026-03-25 | src/app/api/admin/users/route.ts | GET with assertAdminOrThrow, SQL join |
| 2    | done   | 2026-03-25 | src/app/(admin)/admin/layout.tsx | Client nav layout with active tab highlighting |
| 3    | done   | 2026-03-25 | src/app/(admin)/admin/page.tsx | Summary cards: users, agents, active subs |
| 4    | done   | 2026-03-25 | src/app/(admin)/admin/users/page.tsx | Users table with role badge, sub status, agent count |

## Acceptance Criteria

- [x] Admin can navigate to `/admin` and see summary cards
- [x] Admin can navigate to `/admin/users` and see all users
- [x] Subscription status and agent count shown per user
- [x] Non-admin cannot access these pages
- [x] Navigation between admin sections works correctly
