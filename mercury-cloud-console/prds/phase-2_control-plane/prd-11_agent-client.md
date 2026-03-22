---
prd: "11"
title: "Agent client library"
phase: 2
depends_on: ["07"]
estimated_effort: "4 hours"
status: done
---

# PRD-11: Agent Client

## Overview

HTTP helpers for remote Mercury agents: health check and console extension install.

## File

- [src/lib/agent-client.ts](../../src/lib/agent-client.ts)

## Acceptance Criteria

- [x] `fetchAgentHealth`, `installExtensionOnAgent` implemented
