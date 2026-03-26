# PRD: OAuth Connect via Dashboard

## Executive Summary

Mercury's cloud console currently requires users to paste raw API keys to connect LLM providers (BYOK). Non-technical users — the primary audience for the hosted dashboard — find this confusing and error-prone. This feature introduces a one-click OAuth connection flow for Anthropic and GitHub Copilot directly from the dashboard, eliminating the need to locate, copy, and paste API keys. Users click "Connect", complete a guided auth flow in their browser, and are done. The dashboard stores OAuth credentials (encrypted, with auto-refresh) exactly like API keys, so agent provisioning and the model chain system work unchanged.

---

## Problem Statement

**Who:** Non-technical users (business owners, operators) who have been given access to the Mercury cloud console to manage their AI agent. They have no terminal access to the Hetzner server and cannot run `mercury auth login`.

**Problem:** To use Anthropic or GitHub Copilot as their agent's LLM provider, they currently must:
1. Understand what an API key is
2. Navigate to the provider's developer console
3. Generate a key
4. Copy it without revealing it
5. Paste it into the dashboard

This is a significant friction point that causes drop-off and support requests. It also requires users to have (or create) an API-tier account — but many users already have a Claude Pro/Max subscription or a GitHub Copilot subscription, and those subscriptions can be used via OAuth without a separate API key.

**Why it matters:** Users with existing subscriptions cannot currently use them with Mercury at all — they are forced to also buy API access. This is both confusing and unnecessary.

---

## Proposed Solution

Add an OAuth connection flow for supported providers. For each supported provider, the existing "Add Key" UI gains a "Connect via OAuth" button that walks the user through a browser-based auth flow. On completion, the dashboard stores encrypted OAuth credentials in the same `provider_keys` table (with `key_type = "oauth"`). The provisioner injects OAuth tokens instead of API keys when launching agents. Expired tokens are refreshed automatically before injection.

Two flows are implemented based on what each provider's OAuth supports from a web server:

- **Anthropic (Claude Pro/Max):** PKCE authorization code flow. The user is directed to Anthropic's auth page, then pastes a short code back into the modal. The dashboard exchanges the code for tokens server-side.
- **GitHub Copilot:** Device code flow. The dashboard shows a code; the user visits `github.com/login/device` and enters it. The dashboard polls for completion — no redirect or code paste needed.

---

## Core Features

### 1. Anthropic OAuth Connect (PKCE + Paste)

**User story:** As a Claude Pro/Max subscriber, I want to connect my Anthropic account to my Mercury agent without needing a separate API key, so that my subscription is all I need.

**Flow:**
1. User opens Dashboard → Keys → clicks "Connect with Anthropic"
2. Modal opens: brief explanation ("Connect your Anthropic account. You'll need a Claude Pro or Max subscription.")
3. User clicks "Open Anthropic Login" — a new browser tab opens to `https://claude.ai/oauth/authorize?...` (PKCE parameters generated server-side)
4. User logs in and approves on Anthropic's page
5. Anthropic redirects to `https://console.anthropic.com/oauth/code/callback` — Anthropic's own page shows a code
6. User copies the code and pastes it into the modal's text field
7. User clicks "Connect" — dashboard exchanges the code for tokens, stores credentials
8. Modal closes; key list refreshes showing "Anthropic — Connected ✓"

**Acceptance criteria:**
- [ ] PKCE verifier/challenge generated server-side; verifier stored in `oauth_sessions` table with 10-min TTL
- [ ] Auth URL constructed correctly with all required parameters
- [ ] Pasted value parsed correctly whether user pastes full redirect URL or bare `code#state`
- [ ] Token exchange calls `https://console.anthropic.com/v1/oauth/token` with correct body
- [ ] Credentials encrypted with `encryptSecret()` before storage
- [ ] `key_type = "oauth"` set on the stored row
- [ ] Session row deleted after successful exchange
- [ ] Expired sessions (>10 min) rejected with 400
- [ ] 401 if unauthenticated

---

### 2. GitHub Copilot OAuth Connect (Device Code)

**User story:** As a GitHub Copilot subscriber, I want to connect my Copilot account to my Mercury agent from the dashboard, so I can use Copilot models without obtaining a separate API key.

**Flow:**
1. User opens Dashboard → Keys → clicks "Connect with GitHub Copilot"
2. Modal opens; user clicks "Start"
3. Dashboard calls GitHub's device code endpoint, receives `user_code` and `verification_uri`
4. Modal shows the user code prominently (e.g. `ABCD-1234`) with a "Visit github.com/login/device" button
5. User visits the URL, enters the code, approves
6. Dashboard polls the GitHub token endpoint every N seconds (interval from GitHub response)
7. Spinner shows "Waiting for approval on GitHub…"
8. On success: dashboard fetches a Copilot internal token, stores encrypted credentials
9. Modal closes; key list shows "GitHub Copilot — Connected ✓"

**Acceptance criteria:**
- [ ] Device code endpoint called with correct `client_id` and `scope`
- [ ] Session row stores `device_code`, `interval`, `expires_at`
- [ ] Poll endpoint handles `authorization_pending` (return `{ status: "pending" }`), `slow_down` (increase interval), `expired_token` (return error)
- [ ] On GitHub token success: fetches Copilot token from `/copilot_internal/v2/token`
- [ ] Copilot credentials encrypted and stored with `key_type = "oauth"`
- [ ] Poll returns `{ status: "complete", keyId }` on success
- [ ] Session row deleted after completion

---

### 3. OAuth Key Display + Management

**User story:** As a user, I want to see which of my providers are connected via OAuth (vs API key), and be able to disconnect and reconnect.

**Acceptance criteria:**
- [ ] OAuth keys show "Connected" badge instead of masked key string
- [ ] "Disconnect" button removes the key row (same as existing delete)
- [ ] OAuth keys appear in model chain selector with same UX as API keys
- [ ] Wizard `AddKeys` step shows "Connect via OAuth" option for supported providers

---

### 4. OAuth Token Injection in Provisioner

**User story:** As an agent owner, I want my OAuth-connected provider to work seamlessly when my agent is provisioned, without me having to do anything extra.

**Acceptance criteria:**
- [ ] Provisioner checks `key_type` before injecting env vars
- [ ] `key_type = "oauth"`: decrypts JSON credentials, checks `expires`, refreshes if expired, injects `MERCURY_ANTHROPIC_OAUTH_TOKEN` (or `MERCURY_GITHUB_COPILOT_OAUTH_TOKEN`)
- [ ] `key_type = "api_key"`: existing behavior unchanged
- [ ] If token refresh fails at provision time, provisioning returns a clear error (not a silently broken agent)
- [ ] Refreshed credentials re-encrypted and updated in DB

---

### 5. Doc Update — OAuth Precedence

**Acceptance criteria:**
- [ ] `mercury-fork/docs/auth/overview.md` updated with explicit callout: when both OAuth credentials (`auth.json`) and API key (`.env`) exist for a provider, OAuth always takes precedence
- [ ] `mercury-cloud-console/docs/prd-byok.md` updated with a section noting OAuth connections are first-class entries in the key vault

---

## Technical Requirements

### Database

```sql
-- provider_keys: add key_type column
ALTER TABLE provider_keys ADD COLUMN key_type TEXT NOT NULL DEFAULT 'api_key';
-- encryptedKey now stores:
--   api_key → plaintext API key string
--   oauth   → JSON { access: string, refresh: string, expires: number, ...extra }

-- New table for in-progress OAuth flows (short TTL)
CREATE TABLE oauth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  provider    TEXT NOT NULL,       -- "anthropic" | "github-copilot"
  pkce_verifier TEXT,              -- Anthropic only
  device_code TEXT,                -- GitHub Copilot only
  device_interval INTEGER,         -- GitHub Copilot polling interval (seconds)
  expires_at  TEXT NOT NULL,       -- ISO timestamp (~10 min TTL)
  created_at  TEXT NOT NULL
);
```

### API Contract

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/user/oauth/[provider]/start` | Initiate OAuth flow; returns auth URL (Anthropic) or device code (GitHub) |
| `POST` | `/api/user/oauth/[provider]/complete` | Exchange pasted code for tokens (Anthropic only) |
| `GET`  | `/api/user/oauth/[provider]/poll` | Poll for device flow completion (GitHub Copilot only) |

All routes: session-authenticated, `assertUserOrThrow()` guard.

### OAuth Constants (no new dependencies)

```typescript
// Anthropic — PKCE public client (no client secret)
ANTHROPIC_CLIENT_ID   = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
ANTHROPIC_AUTH_URL    = "https://claude.ai/oauth/authorize"
ANTHROPIC_TOKEN_URL   = "https://console.anthropic.com/v1/oauth/token"
ANTHROPIC_REDIRECT_URI= "https://console.anthropic.com/oauth/code/callback"
ANTHROPIC_SCOPES      = "org:create_api_key user:profile user:inference"

// GitHub Copilot — device code flow
GITHUB_CLIENT_ID      = "Iv1.b507a08c87ecfe98"
GITHUB_DEVICE_URL     = "https://github.com/login/device/code"
GITHUB_TOKEN_URL      = "https://github.com/login/oauth/access_token"
GITHUB_COPILOT_TOKEN  = "https://api.github.com/copilot_internal/v2/token"
```

No changes to `@mariozechner/pi-ai` or `mercury-fork`. The dashboard implements token exchange independently using direct `fetch` calls.

### Token Refresh Strategy

- Refresh is triggered **at provisioning time** if `credentials.expires < Date.now()`
- Anthropic: `POST` to `ANTHROPIC_TOKEN_URL` with `grant_type=refresh_token`
- GitHub Copilot: Copilot tokens are short-lived (~1h); re-fetch from `/copilot_internal/v2/token` using the stored GitHub OAuth token (which is long-lived)
- Refreshed credentials are re-encrypted and written back to `provider_keys` before injection
- If refresh fails: provisioning returns HTTP 422 with `{ error: "oauth_refresh_failed", provider }` — user must reconnect

### providers.ts Changes

```typescript
type ProviderMeta = {
  ...existing fields...
  oauthSupported?: boolean;
  oauthType?: "pkce" | "device";
  oauthLabel?: string;
  oauthEnvVar?: string;   // env var for OAuth token (distinct from API key env var)
};
```

New entry: `"github-copilot"` provider.
New helper: `oauthEnvVar(provider)` → `MERCURY_ANTHROPIC_OAUTH_TOKEN` | `MERCURY_GITHUB_COPILOT_OAUTH_TOKEN`.

---

## MVP Scope (v1)

**In:**
- Anthropic OAuth connect (PKCE + paste)
- GitHub Copilot OAuth connect (device code)
- OAuth key display ("Connected" badge)
- Provisioner OAuth token injection + refresh
- Wizard `AddKeys` integration
- Doc precedence update

**Deferred (v2+):**
- Google Gemini OAuth (requires new Google Cloud OAuth client registration)
- OpenAI Codex OAuth (requires new OAuth client registration)
- Proactive background token refresh (cron job pushing refreshed tokens to live agents)
- "Re-connect" flow for expired tokens without full disconnect/reconnect
- OAuth for admin-provisioned agents (admin connecting on behalf of user)

---

## Success Metrics

- % of new users who connect a provider via OAuth (vs BYOK) — target >40% for Anthropic within 30 days of launch
- Support tickets related to API key setup — expect >50% reduction
- Provisioning success rate for OAuth-keyed agents — target >99% (with refresh)

---

## Open Questions

1. **Anthropic code paste UX**: The code paste step is unavoidable given the fixed redirect URI. Should we add a video/GIF in the modal showing exactly where to find the code on Anthropic's page?
2. **GitHub Copilot model selection**: Copilot exposes multiple models (Claude, GPT-4o, etc.). Should the model chain default or let the user pick from a Copilot-specific list?
3. **Admin provisioning**: Should admins be able to trigger the OAuth connect flow on behalf of a user, or is that out of scope?
