---
prd: "08"
title: "Auth"
phase: 2
depends_on: ["07"]
estimated_effort: "4 hours"
status: done
---

# PRD-08: Auth

## Overview

NextAuth v5 credentials provider + JWT session. Register via `POST /api/register`. `AUTH_SECRET` + `AUTH_URL` required.

## Files

- [src/auth.ts](../../src/auth.ts)
- [src/app/api/auth/[...nextauth]/route.ts](../../src/app/api/auth/[...nextauth]/route.ts)
- [src/app/signin/page.tsx](../../src/app/signin/page.tsx)
- [src/app/signup/page.tsx](../../src/app/signup/page.tsx)

## Acceptance Criteria

- [x] Sign up + sign in + protected `(protected)` routes
