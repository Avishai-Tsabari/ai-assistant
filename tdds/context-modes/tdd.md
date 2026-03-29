# Context Modes — Technical Design Document

> **PRD**: [prds/context-modes/prd.md](../../prds/context-modes/prd.md)

## Overview

Implement two context modes per space: **clear** (default, stateless) and **context** (existing sliding window). In clear mode, reply-chain detection uses platform-native reply metadata to reconstruct thread context on demand.

## Data Model Changes

### 1. New column: `messages.reply_to_id`

```sql
ALTER TABLE messages ADD COLUMN reply_to_id INTEGER REFERENCES messages(id);
```

Links a message to its parent in a reply chain. When a user replies to the bot's message M, the new user message gets `reply_to_id = M.id`. The bot's response in turn gets `reply_to_id = <user_message_id>`, maintaining the chain for future replies.

Migration: follows existing `ensureMessagesRunMetaColumn()` pattern — idempotent `ALTER TABLE` wrapped in try/catch.

### 2. New table: `message_platform_ids`

```sql
CREATE TABLE IF NOT EXISTS message_platform_ids (
  mercury_message_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  conversation_external_id TEXT NOT NULL,
  platform_message_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (platform, conversation_external_id, platform_message_id),
  FOREIGN KEY (mercury_message_id) REFERENCES messages(id)
);
CREATE INDEX IF NOT EXISTS idx_mpi_mercury_id
  ON message_platform_ids(mercury_message_id);
```

Maps platform message IDs (WhatsApp `stanzaId`, Discord message ID, Slack `ts`, Telegram `message_id`, Teams activity ID) to Mercury's internal message IDs. This is the bridge that connects "user replied to platform message X" → "that was Mercury message Y".

**Why a separate table?** A single Mercury message can fan out to multiple platform conversations (scheduled tasks). The `messages` table is space-scoped and platform-agnostic; mixing platform IDs into it violates separation.

### 3. Type changes

#### `StoredMessage` (types.ts)
```typescript
export interface StoredMessage {
  // ... existing fields ...
  replyToId?: number;  // NEW: Mercury message ID this is a reply to
}
```

#### `IngressMessage` (types.ts)
```typescript
export interface IngressMessage {
  // ... existing fields ...
  replyToPlatformMessageId?: string;  // NEW: platform ID of message being replied to
  platformMessageId?: string;          // NEW: platform ID of THIS inbound message
}
```

#### `PlatformBridge.sendReply` (types.ts)
```typescript
// BEFORE:
sendReply(threadId: string, text: string, files?: EgressFile[]): Promise<void>;
// AFTER:
sendReply(threadId: string, text: string, files?: EgressFile[]): Promise<string | undefined>;
```

Returns the platform message ID of the sent message. `undefined` if the platform doesn't provide one.

### 4. Config keys

Added to `BUILTIN_CONFIG_KEYS` in `config-builtin.ts`:

| Key | Values | Default | Validator |
|-----|--------|---------|-----------|
| `context.mode` | `"clear"` \| `"context"` | `"clear"` | Enum check |
| `context.reply_chain_depth` | `"1"` – `"50"` | `"10"` | Integer range check |

## New DB Methods

### `addMessage()` — extended signature
```typescript
addMessage(
  spaceId: string,
  role: StoredMessage["role"],
  content: string,
  attachments?: MessageAttachment[],
  replyToId?: number,  // NEW
): number
```

### `addPlatformMessageId()`
```typescript
addPlatformMessageId(
  mercuryMessageId: number,
  platform: string,
  conversationExternalId: string,
  platformMessageId: string,
): void
```
Insert into `message_platform_ids`. Silently ignores duplicates (INSERT OR IGNORE).

### `lookupMercuryMessageId()`
```typescript
lookupMercuryMessageId(
  platform: string,
  conversationExternalId: string,
  platformMessageId: string,
): number | null
```
Single indexed lookup by primary key.

### `getReplyChain()`
```typescript
getReplyChain(messageId: number, maxDepth: number): StoredMessage[]
```
Walks `reply_to_id` pointers backward from `messageId`, collecting up to `maxDepth * 2` messages (each turn = user + assistant). Returns in chronological order (oldest first).

Algorithm:
1. Load message by ID
2. If it has `reply_to_id`, load that message
3. Repeat until `reply_to_id` is null or depth limit reached
4. Reverse to chronological order
5. Return as `StoredMessage[]`

Each hop is O(1) — primary key lookup. Total: O(depth).

## API Contracts

### Console API (new endpoints in `routes/console.ts`)

#### `GET /api/console/spaces`
**Auth**: Bearer `MERCURY_API_SECRET`
**Response**: `{ spaces: Array<{ id, name, createdAt }> }`

#### `GET /api/console/spaces/:spaceId/config`
**Auth**: Bearer `MERCURY_API_SECRET`
**Response**: `{ spaceId, config: Record<string, string>, available: RegisteredConfig[] }`

#### `PUT /api/console/spaces/:spaceId/config`
**Auth**: Bearer `MERCURY_API_SECRET`
**Body**: `{ key: string, value: string }`
**Response**: `{ ok: true }` or `{ error: string }`
**Validation**: Same as internal `/api/config` PUT — built-in + extension keys validated.

### Existing API (unchanged)

`GET/PUT /api/config` — already works for in-chat config management via `mrctl`. No changes needed; the new config keys are automatically available once registered.

## Implementation Sequence

### Phase 1: Data model + config
**Files**: `storage/db.ts`, `types.ts`, `routes/config-builtin.ts`
- Schema migrations
- New DB methods
- Type changes
- Config key registration

### Phase 2: Adapter/bridge changes
**Files**: All 5 files in `bridges/`
- `normalize()`: extract `platformMessageId` and `replyToPlatformMessageId`
- `sendReply()`: change return type, return platform message ID

| Bridge | `platformMessageId` source | `replyToPlatformMessageId` source | `sendReply()` return source |
|--------|---------------------------|----------------------------------|---------------------------|
| WhatsApp | `rawMsg.key.id` | `contextInfo.stanzaId` | `sentMsg.key?.id` |
| Discord | `msg.id` via metadata | `msg.reference?.messageId` via metadata | `sent.id` from channel.send() |
| Telegram | `raw.message_id` | `raw.reply_to_message?.message_id` | `result.message_id` from API |
| Slack | `raw.ts` | `raw.thread_ts` (when differs from ts) | `ts` from chat.postMessage |
| Teams | `raw.id` | `raw.replyToId` | Message ID from adapter response |

**Note**: Slack's `isReplyToBot: false` hardcode (line 76) must be fixed.

### Phase 3: Runtime changes
**Files**: `core/runtime.ts`, `core/handler.ts`

#### executePrompt() flow change (runtime.ts ~line 469)
```
BEFORE:
  history = db.getRecentTurns(spaceId, 10)

AFTER:
  contextMode = db.getSpaceConfig(spaceId, "context.mode") ?? "clear"
  if contextMode == "context":
    history = db.getRecentTurns(spaceId, 10)  // unchanged
  else:  // "clear"
    if replyToPlatformMessageId:
      mercuryId = db.lookupMercuryMessageId(platform, convExtId, replyToPlatformMessageId)
      if mercuryId:
        depth = parseInt(db.getSpaceConfig(spaceId, "context.reply_chain_depth") ?? "10")
        history = db.getReplyChain(mercuryId, depth)
      else:
        history = []  // message predates feature
    else:
      history = []  // new independent message
```

#### Platform ID recording flow
1. User message arrives with `platformMessageId` → stored in `message_platform_ids` after `addMessage()`
2. Bot response stored with `addMessage(..., replyToId=userMessageId)` → returns `assistantMessageId`
3. `assistantMessageId` propagated back to handler via `ContainerResult`
4. Handler calls `bridge.sendReply()` → gets platform message ID back
5. Handler calls `core.recordOutboundPlatformId(assistantMessageId, platform, convExtId, platformMsgId)`

#### handleRawInput() changes
- Pass `IngressMessage` fields through to `executePrompt()`
- `executePrompt()` signature expanded: add `platform?`, `conversationExternalId?`, `replyToPlatformMessageId?`, `platformMessageId?`
- Return `assistantMessageId` in result so handler can record outbound mapping

### Phase 4: Console API + UI
**Files**: `routes/console.ts`, `agent-client.ts`, `AgentDetailClient.tsx`
- New console endpoints (see API contracts above)
- New client functions following existing Bearer token pattern
- Admin UI: space list with per-space context mode dropdown and chain depth input

## Edge Cases

| Case | Behavior |
|------|----------|
| Reply to message predating feature (no platform ID mapping) | Empty history — treated as new message |
| Reply to very old message (weeks) | Works — no age limit, chain walks DB |
| Reply chain exceeds depth limit | Truncated to most recent N turns |
| User replies to their own message, not bot's | Chain walk finds no bot message in ancestry — treated as new message |
| Bot sends multiple messages (text + files) | Only the last sent message's platform ID is recorded; user can reply to any |
| Platform doesn't return message ID from send | `sendReply()` returns `undefined`; no mapping recorded; future replies to that message won't get chain context |
| Cross-platform reply | Impossible at platform level — each platform's reply is scoped to its own messages |
| Scheduler-sent messages | `MessageSender.send()` doesn't change (still `Promise<void>`); scheduler messages don't participate in reply chains |
| Concurrent messages in same space | Space queue serializes; no race condition on `addMessage()` or platform ID recording |

## File Manifest

| File | Changes |
|------|---------|
| `mercury-fork/src/storage/db.ts` | Schema migration, MessageRow type, addMessage signature, 3 new methods |
| `mercury-fork/src/types.ts` | StoredMessage.replyToId, IngressMessage fields, PlatformBridge.sendReply return |
| `mercury-fork/src/core/routes/config-builtin.ts` | 2 new config keys + validators |
| `mercury-fork/src/bridges/whatsapp.ts` | normalize() + sendReply() changes |
| `mercury-fork/src/bridges/discord.ts` | normalize() + sendReply() changes |
| `mercury-fork/src/bridges/telegram.ts` | normalize() + sendReply() changes |
| `mercury-fork/src/bridges/slack.ts` | normalize() + sendReply() changes + fix isReplyToBot |
| `mercury-fork/src/bridges/teams.ts` | normalize() + sendReply() changes |
| `mercury-fork/src/core/runtime.ts` | executePrompt() branching, platform ID recording, return type |
| `mercury-fork/src/core/handler.ts` | Capture sendReply return, record outbound platform ID |
| `mercury-fork/src/core/routes/console.ts` | 3 new endpoints |
| `mercury-cloud-console/src/lib/agent-client.ts` | 3 new client functions |
| `mercury-cloud-console/src/app/(admin)/admin/agents/[id]/AgentDetailClient.tsx` | Space config UI section |
