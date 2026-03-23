# Conditional Context

Mercury can skip loading the full conversation session for prompts that don't need it, reducing token usage and latency.

## How It Works

Before each container run, Mercury classifies the incoming prompt:

1. **Classifier** inspects the prompt text. **Default bias is minimal context**: answer from the current message unless history is clearly needed.
2. If the prompt is **standalone**, the container runs with `--no-session` and ambient messages are excluded — the agent sees only the current prompt (plus any quote/reply text the platform embedded in the message).
3. If the prompt **needs history** (e.g. "as I said", "summarize", "recap", "what we said", Hebrew "סכם" / "מה שאמרנו"), the full session and ambient context are loaded as usual.
4. **Reply-to-bot** (Telegram/WhatsApp quote reply to the bot, etc.) still routes the message to the assistant, but **does not** force full session: the classifier decides, same as a mention. Use `mrctl recall "<keywords>"` when the agent needs older turns that are not in the current pi session.
5. After a minimal-context run, the user prompt and assistant reply are **merged back** into the session file so the conversation history stays complete.
6. When **`MERCURY_AUTO_COMPACT_THRESHOLD`** is set, after each **full-session** run Mercury may auto-run pi compaction if the session entry count exceeds the threshold (minimal runs skip this). All messages remain in SQLite; compaction only shrinks the pi session file.

```
User prompt
    │
    ▼
┌──────────────┐     needs history?      ┌─────────────────┐
│  Classifier  │ ─── yes ──────────────► │  Full session    │
│  (heuristic) │                         │  (normal run)    │
└──────┬───────┘                         └─────────────────┘
       │ no
       ▼
┌─────────────────┐     after reply     ┌──────────────────┐
│  --no-session   │ ──────────────────► │  Merge into      │
│  (minimal run)  │                     │  session file     │
└─────────────────┘                     └──────────────────┘
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MERCURY_CONDITIONAL_CONTEXT_ENABLED` | `true` | Enable/disable the feature |
| `MERCURY_CONTEXT_CLASSIFIER` | `heuristic` | `heuristic` (regex, no API cost) or `llm` (LLM-based, higher accuracy) |
| `MERCURY_CONTEXT_CLASSIFIER_PROVIDER` | `modelProvider` | Provider for LLM classifier (e.g. `groq`, `google`) |
| `MERCURY_CONTEXT_CLASSIFIER_MODEL` | `model` | Model for LLM classifier (e.g. `llama-3.3-70b-versatile`, `gemini-2.5-flash`) |
| `MERCURY_CONTEXT_CLASSIFIER_API_KEY` | — | Optional. Dedicated API key for the classifier. When set, overrides provider-specific keys. |
| `MERCURY_AUTO_COMPACT_THRESHOLD` | — | Optional (10–10000). After full-session runs, compact the pi session when entry count exceeds this value. |
| `MERCURY_COMPACT_KEEP_RECENT_TOKENS` | — | Optional. Passed to pi when compacting (manual or auto). |

Set `MERCURY_CONDITIONAL_CONTEXT_ENABLED=false` to always use the full session (previous default behavior).

### LLM Classifier

When `MERCURY_CONTEXT_CLASSIFIER=llm`, Mercury uses a small LLM call to classify each prompt.

**Simplest setup:** Leave `MERCURY_CONTEXT_CLASSIFIER_PROVIDER`, `MERCURY_CONTEXT_CLASSIFIER_MODEL`, and `MERCURY_CONTEXT_CLASSIFIER_API_KEY` unset (or commented). With no overrides, the classifier walks the **resolved model chain** (`MERCURY_MODEL_CHAIN`, or legacy primary + fallback) in order: each leg uses its own provider, model, and API key. The first leg that can run the classify call wins; if every leg lacks a key, has an unknown model, or errors, Mercury falls back to the full session (one summary warn). This matches how the main agent picks models without pinning the classifier to a single quota.

**Dedicated classifier:** Set `MERCURY_CONTEXT_CLASSIFIER_PROVIDER` and/or `MERCURY_CONTEXT_CLASSIFIER_MODEL` to pin **one** provider and model (no chain walk)—for example a cheap Groq model while the main agent uses a longer chain.

- **Provider** — Same providers as the main agent (groq, google, anthropic, openai, openrouter). Unset fields fall back to `MERCURY_MODEL_PROVIDER` / `MERCURY_MODEL`.
- **Model** — Must be a pi-ai supported model ID (e.g. `llama-3.3-70b-versatile`, `gemini-2.5-flash`).
- **API key** — Prefer `MERCURY_CONTEXT_CLASSIFIER_API_KEY` for a dedicated classifier key. Otherwise falls back to provider-specific vars (e.g. `MERCURY_GROQ_API_KEY` for groq, `MERCURY_OPENROUTER_API_KEY` for openrouter).

If the pinned pair cannot run (missing key, unknown model, or API error), Mercury logs a warning and falls back to full session. In default chain mode, a warning is logged only after **every** leg has failed.

## Heuristic Classifier

The default classifier uses pattern matching (no API cost):

- **Needs history** — Prompt contains references like "as I said", "previous", "summarize", "recap", "wrap up", "continue", "what we discussed", "what we said", "today's chat", "remind me", "recall", "context from", or Hebrew "סכם"/"תסכם"/"מה שאמרנו"/"סיכום השיחה"/"נאמר היום" (and similar recap phrasing).
- **Standalone** — No history-indicating patterns found.

When minimal context is used, both the session file and ambient messages (non-triggered group chat context) are excluded from the prompt.

Safety guards:

- If the **session file doesn't exist** yet, full context is used once so the session can initialize; afterward, standalone prompts can use minimal context even with short history.
- Prompts with **attachments** always use full context.
- XML tags (like `<caller />`) are stripped before classification so they don't false-match.

### Reply-to-bot and HTTP chat

- **Reply to assistant** triggers the assistant in groups (same as a mention), but **full vs minimal** context is decided by the classifier (and the usual guards: attachments, disabled classifier, etc.).
- **`POST /chat`** uses minimal context by default. Send **`"fullContext": true`** in the JSON body to always load the full pi session (dashboard reason `reply_or_full_api`).
- **`mrctl recall`** — searches stored messages in the current space (`GET /api/messages/search`, same permission as `compact`). Use when you need text from older turns without loading the full session.

A **`conversation-recap`** skill in global skills reminds the agent when explicit recap/summary requests should rely on loaded history.

## Session Merge

When a minimal-context run completes, the prompt and reply are appended to the session file using `SessionManager.appendMessage()`. The merged assistant message carries placeholder metadata (`api: "mercury-merge"`, zero usage) to distinguish it from direct agent runs.

The merge is fire-and-forget — if it fails, the reply is still returned to the user and the error is logged.

## Files

| File | Role |
|------|------|
| `src/core/context-classifier.ts` | Prompt classification (heuristic + LLM) |
| `src/core/session-merge.ts` | Post-run session file merge |
| `src/core/runtime.ts` | Calls classifier, passes flag to container runner |
| `src/agent/container-runner.ts` | Accepts `useMinimalContext`, strips ambient when minimal, triggers merge |
| `src/agent/container-entry.ts` | Uses `--no-session` when minimal |
| `src/config.ts` | Config schema for conditional context env vars |

## Logging

At `debug` log level, each classification is logged:

```json
{"msg":"Context classifier decision","useMinimalContext":true,"mode":"heuristic"}
```

When the LLM classifier fails (no API key, model not found, API error), a warning is logged with the reason and a hint for fixing it.
