---
prd: "12"
title: "API key encryption"
phase: 2
depends_on: ["07"]
estimated_effort: "4 hours"
status: done
---

# PRD-12: Envelope-style AES-GCM helpers

## Overview

`encryptSecret` / `decryptSecret` using `CONSOLE_ENCRYPTION_MASTER_KEY` (hex or arbitrary string → scrypt). Use when persisting agent `MERCURY_API_SECRET` in `agents.api_secret_cipher`.

## File

- [src/lib/encryption.ts](../../src/lib/encryption.ts)

## Acceptance Criteria

- [x] Symmetric encrypt/decrypt round-trip
- [ ] Wire into provision → DB ingest (future)
