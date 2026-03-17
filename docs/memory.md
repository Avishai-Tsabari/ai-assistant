# Memory

Running log of decisions and context. Update after significant work.

---

## Format

Add new entries at the top with date:

```
### YYYY-MM-DD — [Topic]
- Decision or context note
```

---

### 2026-03-16 — Telegram reply-to-bot
- Fixed: replying directly to the bot's message in Telegram now triggers a response (like WhatsApp/Discord), without needing an explicit @mention.
- Cause: `@chat-adapter/telegram` does not set `isReplyToBot` in metadata. The bridge now derives it from the raw message's `reply_to_message.from.id === botUserId`.

---
