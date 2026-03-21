# Phases

Completed milestones. Add entries as you finish major work.

---

### Phase 1 — Cursor Rules, Skills, and Docs (2026-03-16)

- Created `.cursor/rules/` with project-core, mercury-architecture, typescript-standards
- Created `.cursor/skills/mercury-development/` for Mercury development workflows
- Created `docs/` with memory.md, plan.md, phases.md, decisions.md

### Phase 2 — Cursor sub-agents for ops / security / verify (2026-03-19)

- Added `.cursor/agents/mercury-ops.md`, `security-reviewer.md`, `verifier.md` for service ops, security review, and post-change validation workflows

### Phase 3 — Assistant extensions: PDF + voice, drop web-browser sample (2026-03-20)

- Added local `mercury-assistant/.mercury/extensions/pdf/` (skill + Python helpers) and `voice-transcribe/` (Whisper script + extension)
- Removed bundled `web-browser` extension from the sample assistant; expanded `.env.example` and extensions README for optional Brave/pinchtab, container compat, and voice ASR vars
- Added opt-in **project-docs-sync** skill + rule (non–always-on) so milestone doc updates stay explicit and don’t bloat default context

### Phase 4 — Optional mercury.yaml (2026-03-20)

- Added optional project `mercury.yaml` / `mercury.yml` merged into `loadConfig()` with **env override**; `MERCURY_CONFIG_FILE` and secret blocklist documented in `mercury-fork/docs/configuration.md`, template `mercury.example.yaml`, slim `env.template`

---

## Format

```
### Phase N — [Name] (YYYY-MM-DD)
- What was done
```

---
