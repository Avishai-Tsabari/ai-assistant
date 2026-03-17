# Telegram Setup & Windows Path Fix

## Setup Steps

1. **Create a space:**
   ```bash
   mercury spaces create tagula
   ```

2. **Start Mercury:**
   ```bash
   mercury run
   ```

3. **Send a message** to your Telegram bot (DM or group with trigger like `@Mercury hello`).

4. **List and link the conversation:**
   ```bash
   mercury conversations
   mercury link <conversation_id> tagula
   ```

5. **Use the official agent image** (in `.env`):
   ```env
   MERCURY_AGENT_IMAGE=ghcr.io/michaelliv/mercury-agent:latest
   ```
   The local `mercury-agent:latest` may be missing the `pi` CLI.

## Windows-Specific Fixes (applied to `mercury-fork`)

### 1. PATH not set in container (`container-runner.ts`)

Docker containers launched by Mercury receive env vars via `-e` flags, which can
result in an empty `PATH`. Added an explicit PATH entry to `envPairs`:

```typescript
{ key: "PATH", value: "/root/.bun/bin:/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin" },
```

### 2. Backslash in container workspace path (`container-runner.ts`)

**Root cause of the `ENOENT: posix_spawn 'pi'` error.**

On Windows, `input.spaceWorkspace` uses backslashes (e.g. `C:\...\spaces\tagula`).
The code replaces the `spacesRoot` prefix with `/spaces`, but the remaining path
separator stays as `\`, producing `/spaces\tagula` — an invalid Linux path.

**Fix:** Added `.replaceAll("\\", "/")` after the prefix replacement:

```typescript
spaceWorkspace: input.spaceWorkspace
  .replace(spacesRoot, "/spaces")
  .replaceAll("\\", "/"),
```

The error message (`posix_spawn 'pi'`) was misleading — `ENOENT` was actually
caused by the non-existent working directory `/spaces\tagula`, not a missing `pi`
binary. Bun reports the spawned command name in the error even when the real
problem is the `cwd`.
