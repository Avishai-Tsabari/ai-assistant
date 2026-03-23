---
name: console-admin
description: >-
  Operator guidance for managed Mercury deployments — dashboard, mrctl, health checks,
  and mercury-cloud-console. Use when the user asks about billing, API keys, VPS status,
  or control-plane tasks.
---

# Console admin (operator)

## Dashboard

- Open `/dashboard` (or `/`) with `MERCURY_API_SECRET` as Bearer or `mercury_token` cookie.
- **Usage** — token estimates per space.
- **Billing / API keys** — informational panels; real billing lives in the control plane for hosted setups.

## Remote JSON API (control plane)

When `MERCURY_API_SECRET` is set, automation can call:

- `GET /api/console/extensions/catalog`
- `POST /api/console/extensions/install` — JSON `{ "catalogName": "napkin" }` or `{ "source": "Michaelliv/mercury#examples/extensions/napkin" }`
- `DELETE /api/console/extensions/:name`

Use header `Authorization: Bearer <MERCURY_API_SECRET>`.

## mrctl (inside agent container)

Built-in commands (`tasks`, `roles`, `stop`, …) hit the host `/api/*` — same RBAC as chat.

## Health

- `GET /health` on the agent host (port from `MERCURY_PORT`, default 8787).

## Environment

- `MERCURY_CLOUD_CONSOLE_URL` — optional base URL of the operator console (for human-facing links in replies).
