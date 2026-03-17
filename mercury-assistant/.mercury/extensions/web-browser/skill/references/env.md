# Pinchtab Environment Variables

## Core runtime

| Var | Default | Description |
|---|---|---|
| `BRIDGE_BIND` | `127.0.0.1` | Bind address. Set `0.0.0.0` for network access |
| `BRIDGE_PORT` | `9867` | HTTP port |
| `BRIDGE_HEADLESS` | `true` | Run Chrome headless |
| `BRIDGE_TOKEN` | (none) | Bearer auth token (recommended with `0.0.0.0`) |
| `BRIDGE_PROFILE` | `~/.pinchtab/chrome-profile` | Chrome profile dir |
| `BRIDGE_STATE_DIR` | `~/.pinchtab` | State/session storage |
| `BRIDGE_NO_RESTORE` | `false` | Skip tab restore on startup |
| `BRIDGE_STEALTH` | `light` | Stealth level: `light` or `full` — use `full` to reduce CAPTCHA |
| `BRIDGE_MAX_TABS` | `20` | Max open tabs (0 = unlimited) |
| `BRIDGE_BLOCK_IMAGES` | `false` | Block image loading |
| `CHROME_BINARY` | (auto) | Path to Chrome/Chromium binary |
| `CHROME_FLAGS` | (none) | Extra Chrome flags (space-separated) |

## CLI client

| Var | Default | Description |
|---|---|---|
| `PINCHTAB_URL` | `http://localhost:9867` | Pinchtab server URL for CLI commands |
| `PINCHTAB_TOKEN` | (none) | Auth token for CLI (sent as `Authorization: Bearer`) |
