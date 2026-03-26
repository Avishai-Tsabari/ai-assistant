# PRD: BYOK — Bring Your Own Key (Model Provider Management)

## Executive Summary

Mercury agents currently support only Anthropic as a model provider, with the API key hardcoded into each agent's server configuration at provisioning time. This PRD defines the BYOK (Bring Your Own Key) feature, which allows users to register their own API keys for any supported LLM provider (Anthropic, OpenAI, Google Gemini, Groq, Mistral, OpenRouter, and others), store them encrypted in the Mercury cloud console, and assign them to agents as an ordered model chain with automatic fallback. The result is a self-service, multi-provider agent setup where users control which models power their agents and can rotate keys without reprovisioning.

---

## Problem Statement

### Who has this problem?
Users who want to deploy Mercury agents using their existing LLM provider subscriptions or API contracts—rather than being locked into a single provider at provisioning time.

### What is the problem?
1. **Single-provider lock-in**: Mercury only supports Anthropic. Users with OpenAI, Gemini, or Groq accounts cannot use them.
2. **No self-service key management**: API keys are entered at provision time by an admin and baked into the VPS `.env` file. There is no way to rotate a key without reprovisioning the server.
3. **No model chain / fallback**: If the primary provider is down or rate-limited, there is no fallback. A single bad API response brings the agent to a halt.
4. **Admin bottleneck**: Users cannot manage their own keys. Every key change requires admin involvement.

### Why does it matter?
- Users may already have credits or agreements with providers other than Anthropic.
- Cost optimization: users want to route cheaper/faster requests to Groq or Gemini while using Claude for complex tasks.
- Resilience: a model chain ensures uptime even when one provider has an outage.
- Security hygiene: key rotation should be a self-service, low-friction operation.

---

## Proposed Solution

A per-user encrypted key vault in the Mercury cloud console. Users add one API key per provider (labeled freely), then assign an ordered list of `{provider, key, model}` legs to each agent as its **model chain**. The primary leg is tried first; subsequent legs are fallbacks. At provision time, resolved keys are injected into the agent's `.env`. When a user later rotates a key, the console pushes the updated environment to the live agent without reprovisioning.

---

## Core Features

### 1. User Key Vault

**Description**: A per-user encrypted store of LLM provider API keys. Keys are never returned in plaintext from the API; they are encrypted at rest using AES-256-GCM with the console master key.

**User story**: _As a Mercury user, I want to store my API keys for Anthropic, OpenAI, and other providers in one place, so I don't have to paste them into every provisioning request._

**Acceptance criteria**:
- [ ] User can add a key: select provider, enter API key, optional label
- [ ] Keys appear in the dashboard as `{provider} — {label} — added {date}` with no plaintext value shown
- [ ] User can edit a key's label without changing the key value
- [ ] User can rotate a key by entering a new value for an existing entry
- [ ] User can delete a key (with confirmation warning if it is referenced by an agent)
- [ ] Encryption: keys stored as AES-256-GCM ciphertext; plaintext never written to disk or logged
- [ ] Access control: a user can only read/write their own keys; no cross-user access

**Supported providers (v1)**:
| Provider | Env var injected |
|---|---|
| Anthropic | `MERCURY_ANTHROPIC_API_KEY` |
| OpenAI | `MERCURY_OPENAI_API_KEY` |
| Google Gemini | `MERCURY_GEMINI_API_KEY` |
| Groq | `MERCURY_GROQ_API_KEY` |
| Mistral | `MERCURY_MISTRAL_API_KEY` |
| OpenRouter | `MERCURY_OPENROUTER_API_KEY` |
| Custom | `MERCURY_{PROVIDER_UPPERCASE}_API_KEY` |

---

### 2. Per-Agent Model Chain Configuration

**Description**: Each provisioned agent has a `modelChainConfig` that defines an ordered list of `{provider, keyId, model}` legs. The first leg is the primary; subsequent legs are fallbacks (tried in order if a leg fails or times out). The chain is injected as `MERCURY_MODEL_CHAIN` JSON in the agent's `.env`.

**User story**: _As a Mercury user, I want my agent to try Claude first and fall back to Gemini if it's unavailable, so that my agent stays responsive even during provider outages._

**Acceptance criteria**:
- [ ] User can configure the model chain for each of their agents from the dashboard
- [ ] Each leg: provider (from key vault), model name (free text), order (drag or up/down)
- [ ] At least one leg is required; up to 6 legs supported
- [ ] Saving the chain updates the DB and best-effort pushes updated env to the live agent
- [ ] If the agent is offline, the DB change is saved and the push is retried on next agent contact
- [ ] The `MERCURY_MODEL_CHAIN` env var reflects the chain in `[{provider, model}, ...]` format

---

### 3. Onboarding Integration

**Description**: The onboarding flow prompts the user to add at least one provider key before provisioning an agent, so provisioning cannot proceed with no keys configured.

**User story**: _As a new Mercury user, I want clear guidance on what I need to set up before I can provision an agent._

**Acceptance criteria**:
- [ ] Onboarding step 1 shows key count and a direct link to `/dashboard/keys` if zero keys exist
- [ ] If at least one key is saved, step 1 shows a green checkmark with the count
- [ ] Provisioning flow references user's stored keys (no raw key re-entry for users with keys saved)

---

### 4. Admin Provision Form Update

**Description**: The admin provision form (used by admins to provision agents on behalf of users) is updated to support the model chain format. Admins enter keys inline at provision time; these are automatically saved to the target user's key vault.

**User story**: _As a Mercury admin, I want to provision an agent with a multi-provider model chain without needing the user to set up keys first._

**Acceptance criteria**:
- [ ] Form replaces single "Anthropic API Key" field with a dynamic model chain builder
- [ ] Each chain leg: provider selector, API key input (password), model name input
- [ ] "Add fallback" button adds additional legs; "×" removes a leg (min 1 leg)
- [ ] Provider selection auto-fills a sensible default model name
- [ ] Keys entered during admin provisioning are saved to the user's key vault (encrypted)
- [ ] Agent model chain config is stored in DB alongside the agent record

---

## Technical Requirements

### Storage
- New SQLite table: `provider_keys (id, user_id FK, provider, label, encrypted_key, created_at)`
- New column on `agents`: `model_chain_config TEXT` (JSON)
- Encryption: AES-256-GCM via existing `encryptSecret` / `decryptSecret` in `src/lib/encryption.ts`
- Master key: `CONSOLE_ENCRYPTION_MASTER_KEY` env var (required; provisioning fails without it)
- Keys and agents are inserted atomically in a DB transaction at provision time

### API Surface
| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/user/keys` | User session | List user's keys (masked) |
| POST | `/api/user/keys` | User session | Add a key |
| PUT | `/api/user/keys/[id]` | User session (owner) | Update label or rotate value |
| DELETE | `/api/user/keys/[id]` | User session (owner) | Remove a key |
| GET | `/api/user/agents/[id]/model-config` | User session (owner) | Get agent's chain |
| PUT | `/api/user/agents/[id]/model-config` | User session (owner) | Update agent's chain |
| POST | `/api/admin/provision` | Admin session | Provision with modelChain[] |

### Agent env injection
```
MERCURY_ANTHROPIC_API_KEY=sk-ant-...
MERCURY_GEMINI_API_KEY=AIza...
MERCURY_MODEL_CHAIN=[{"provider":"anthropic","model":"claude-sonnet-4-6"},{"provider":"google","model":"gemini-2.5-flash"}]
```

### Live key push
- When user updates model chain, the console calls `PUT /api/console/adapters/configure` on the live agent with updated env vars via the `__model_providers` adapter entry
- This is best-effort; if the agent is offline the DB change is persisted and the push is silently skipped

### Security constraints
- `encryptedKey` column is never selected in list queries (only fetched when needed for decryption)
- All user API routes validate `userId === session.user.id` (ownership enforced at DB query level)
- `getMasterKey()` is centralised in `src/lib/encryption.ts`—never read inline from `process.env`
- Plaintext keys exist only in memory during encryption/decryption; never logged or serialised

---

## MVP Scope (v1 — Implemented)

| Feature | Status |
|---|---|
| User key vault (add, edit label, rotate, delete) | ✅ Done |
| Per-agent model chain config | ✅ Done |
| Keys page at `/dashboard/keys` | ✅ Done |
| Onboarding key-count indicator | ✅ Done |
| Admin provision form (model chain builder) | ✅ Done |
| Atomic DB transaction for provision | ✅ Done |
| Best-effort live push on chain update | ✅ Done |

---

## Out of Scope (v1)

- **Space-level key overrides**: agents have one chain; individual spaces within an agent cannot yet override the model. Deferred to v2 when spaces have their own config.
- **Key health checks**: validating that a stored API key is still valid (not expired/revoked). Deferred — requires per-provider validation endpoints.
- **Key expiry / rotation reminders**: notifying users when a key hasn't been rotated in N days.
- **Key sharing across users**: keys are strictly per-user. Team key pools or org-level keys are out of scope.
- **OAuth-based provider auth**: `mercury auth login` CLI OAuth flow is separate and not integrated into the cloud console key vault.
- **Model capability filtering**: the UI does not yet filter model names by provider or validate that a model name is correct.
- **Usage tracking**: no per-provider token usage or cost tracking in this version.
- **Key import from `.env`**: no bulk import from existing environment files.

---

## Future Phases

### v2 — Key Health & Rotation
- **Key validation**: on save, make a minimal test call to the provider to verify the key is valid
- **Key expiry tracking**: optional expiry date field; UI warns when a key is approaching expiry
- **Rotation reminders**: configurable notification (email or in-app) after N days without rotation

### v3 — Space-Level Model Overrides
- Individual spaces within an agent can override the model chain (e.g., a "research" space uses Claude Opus while a "quick replies" space uses Groq)
- Requires spaces to have a config row linked to the agent's key pool

### v4 — Org / Team Keys
- Org-level key vault: keys shared across all users in an organisation
- Per-user keys take precedence over org keys (override semantics)
- Audit log: track which user's agent consumed which key

### v5 — Usage & Cost Visibility
- Per-provider token usage aggregated from agent logs
- Cost estimate per agent per month based on model pricing
- Alert when estimated monthly spend exceeds a user-defined threshold

---

## Success Metrics

| Metric | Target |
|---|---|
| % of new agents provisioned with multi-provider chain | > 40% within 60 days of launch |
| Key rotation rate | At least 1 rotation per user per quarter |
| Support tickets about "can't change my API key" | Drop to 0 after launch |
| Provider diversity | > 3 distinct providers in active use across the fleet |
| Provisioning failure rate due to missing key | < 1% (previously higher due to manual key entry errors) |

---

## Open Questions

1. **Key rotation push reliability**: the live-push to agents uses `adapters/configure` which may not actually hot-reload provider keys without a process restart. Does `mercury-fork` support live env var reloading for `MERCURY_MODEL_CHAIN`? If not, users need to restart their agent after a key rotation.
2. **Duplicate keys**: should the system prevent a user from adding two keys for the same provider? Currently allowed (useful for "work" vs "personal" keys), but may cause confusion when building model chains.
3. **Admin visibility into user keys**: should admins be able to see (but not read) the provider list for a user's keys for support purposes? Currently fully hidden from admins.
4. **`CONSOLE_ENCRYPTION_MASTER_KEY` rotation**: there is no key rotation mechanism for the master encryption key. If it is compromised, all stored provider keys must be re-encrypted. This needs a migration path.
