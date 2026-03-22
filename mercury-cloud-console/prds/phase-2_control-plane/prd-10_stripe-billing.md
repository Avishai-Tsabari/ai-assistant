---
prd: "10"
title: "Stripe billing"
phase: 2
depends_on: ["08"]
estimated_effort: "6 hours"
status: done
---

# PRD-10: Stripe

## Overview

Webhook route verifies signature and logs events. `getStripe()` helper for future checkout. Subscriptions table not yet updated from webhooks.

## Files

- [src/app/api/webhooks/stripe/route.ts](../../src/app/api/webhooks/stripe/route.ts)
- [src/lib/stripe.ts](../../src/lib/stripe.ts)

## Acceptance Criteria

- [x] Webhook endpoint returns 501 if Stripe env unset; verifies when configured
- [ ] Checkout + customer portal (future)
