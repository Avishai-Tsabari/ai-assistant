# Phase 1 Retrospective

Date: 2026-03-22

## Summary

Delivered Hetzner provisioning CLI, cloud-init generator, extension catalog, health-check script, and operator documentation under `mercury-cloud-console/`.

## What went well

- Cloud-init encoded extension list as base64 lines to avoid shell `#` comment issues.
- Systemd unit uses `SupplementaryGroups=docker` so `mercury run` works without interactive `newgrp`.
- Mercury fork gained JSON `/api/console/*` for remote `mercury add` / catalog install.

## What was tricky

- First-boot health timing: Docker image pull + derived image build can exceed short timeouts; provision script allows ~15 minutes.
- Hetzner DNS API uses `dns.hetzner.com` — documented; record name is relative to the zone.
- `mercury init` ordering: `.env` and `mercury.yaml` must exist before `mercury init` so secrets are not overwritten.

## PRD accuracy

- PRDs matched implementation; DNS automation simplified to optional zone id + hostname record.

## Action items

- Add automated test on a disposable CX22 when credentials available.
- Link `provision` output to control-plane DB `agents` rows (user id) in a follow-up PRD.
