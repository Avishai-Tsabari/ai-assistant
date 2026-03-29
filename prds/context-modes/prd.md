# Context Modes — Product Requirements Document

## Problem Statement

Mercury currently uses a fixed 10-turn sliding window for all conversations. This creates two problems:

1. **Context pollution in groups**: In multi-user group chats, the assistant sees unrelated messages from other users, leading to confused or off-topic responses.
2. **Stale context in async conversations**: On WhatsApp and Telegram — Mercury's primary consumer platforms — users send a message, leave, and come back later. The sliding window accumulates stale context that pollutes new, unrelated questions.

Users need a mode where each interaction starts clean, with the ability to continue a specific thread when they explicitly choose to.

## Goals

- Provide a **clear mode** (default) where every message gets a fresh context — only the current prompt and knowledge base (AGENTS.md, MEMORY.md).
- Allow users to **continue a thread** by replying to the bot's message using the platform's native reply feature, preserving that reply chain as context.
- Allow admins to toggle between clear mode and the existing **context mode** (sliding window) per space.
- Work consistently across all supported platforms: WhatsApp, Discord, Slack, Telegram, Teams.

## Non-Goals / Out of Scope

- Session timeouts or time-based heuristics for detecting continuations
- Semantic topic-change detection (AI-powered "is this a new topic?")
- Cross-platform reply chains (a WhatsApp reply chain cannot continue from Telegram)
- DM-specific fallback heuristics (DMs follow the same rule as groups)
- Changes to context mode behavior (sliding window stays as-is)

## Modes

### Clear Mode (default)

- Every new message (not a reply) gets **zero prior conversation history**. The agent sees only:
  - The current user prompt
  - System prompt (AGENTS.md)
  - Episodic memory (MEMORY.md)
  - Space preferences
  - Attachments
- When the user **replies to the bot's message** using the platform's native reply feature:
  - The full reply chain is included as context, up to a configurable depth (default: 10 turns)
  - A "turn" = one user message + one assistant response
  - The chain has no age limit — replying to a bot message from last week works
- All messages are **always stored** in the database regardless of mode. Clear mode only affects what the agent *sees*, not what Mercury *records*.

### Context Mode

- Existing behavior: sliding window of the last 10 user/assistant turn pairs from the space.
- No changes to this mode.

## User Stories

### New question (clear mode)
> As a user, I send a message to the bot without replying to any prior message. The bot answers based only on my question and its knowledge base, with no prior conversation context.

### Reply follow-up (clear mode)
> As a user, I reply to the bot's previous answer using my platform's reply feature. The bot sees my original question, its answer, and my follow-up — allowing me to ask clarifying questions or continue the thread.

### Deep reply chain (clear mode)
> As a user, I have a 15-message back-and-forth with the bot via reply chain. The bot sees the last 10 turns (configurable) of that chain, not the entire history.

### Admin toggles mode
> As an admin, I set `context.mode=context` on a specific space via `mrctl config set` or the admin console, switching that space to sliding-window behavior.

### Admin configures chain depth
> As an admin, I set `context.reply_chain_depth=5` to limit reply chains to 5 turns on a specific space.

### Group chat isolation (clear mode)
> As a user in a multi-user group with `trigger.match=mention`, I @mention the bot with a question. The bot answers without seeing other users' unrelated messages. Another user can independently @mention the bot and get their own clean response.

### Reply in group (clear mode)
> As a user in a group, I reply to the bot's response to my question. The bot sees only my thread (original question → bot's answer → my follow-up), not other users' interactions.

## UX Per Platform

| Platform | How to start a reply chain | User gesture |
|----------|---------------------------|--------------|
| WhatsApp | Swipe right on bot's message, or long-press → Reply | Native quote-reply |
| Telegram | Long-press bot's message → Reply | Native reply-to-message |
| Discord | Click "Reply" on bot's message | Reply reference |
| Slack | Click "Reply in thread" on bot's message | Thread (`thread_ts`) |
| Teams | Hover → Reply on bot's message | Reply activity (`replyToId`) |

In all cases: a message sent **without** using the reply feature is treated as a new, independent question.

## Configuration

| Config key | Values | Default | Scope |
|------------|--------|---------|-------|
| `context.mode` | `"clear"` \| `"context"` | `"clear"` | Per space |
| `context.reply_chain_depth` | Integer 1–50 | `"10"` | Per space |

Configurable via:
- `mrctl config set context.mode context` (in-chat, from inside container)
- Admin console → Agent → Space settings (web UI)

## Acceptance Criteria

1. In clear mode, a new message (no reply) produces a response with zero prior conversation context.
2. In clear mode, replying to a bot message includes the full reply chain (up to configured depth) as context.
3. Reply chains work on all 5 supported platforms (WhatsApp, Discord, Slack, Telegram, Teams).
4. Context mode behavior is unchanged (10-turn sliding window).
5. Mode can be toggled per space via `mrctl config set` and the admin console.
6. Reply chain depth is configurable per space.
7. All messages continue to be stored in the database regardless of mode.
8. Reply chains are per-adapter — a WhatsApp chain cannot include Telegram messages.
9. Reply chains have no age limit — replying to a week-old bot message works if the data exists.
10. Default mode for all spaces (new and existing) is clear.
