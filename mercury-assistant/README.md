# Mercury Assistant

Personal AI assistant powered by [Mercury](https://github.com/Michaelliv/mercury), running on WhatsApp with Google Gemini.

## What's Configured

| Component | Choice |
|-----------|--------|
| **LLM** | Google Gemini (`gemini-2.5-flash`) |
| **Chat platform** | WhatsApp (via Baileys) |
| **Container** | Local build (`mercury-agent:latest`) |

## Prerequisites

- **Node.js** (for `mercury-ai` CLI)
- **Docker** (must be running)
- **Mercury agent image** (built locally — see below)
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)
- **WhatsApp** on your phone (for pairing)

## Optional features

This repo **bundles** two local extensions under `.mercury/extensions/` (**pdf**, **voice-transcribe**). Add more capabilities from the dashboard (**Features** tab at `/dashboard`) or with `mercury add …` (e.g. knowledge vault). Restart Mercury after install or removal.

## Quick Start

### 1. Ensure Docker is running

```bash
docker ps
```

### 2. Start Mercury

```bash
mercury run
```

On first run with WhatsApp, you may need to pair:

```bash
mercury auth whatsapp
```

Scan the QR code with **WhatsApp → Settings → Linked Devices → Link a Device**.

### 3. Test locally (without adapters)

```bash
mercury chat "Hello, can you help me?"
```

### 4. Link conversations to spaces

When messages arrive from WhatsApp:

```bash
mercury conversations --unlinked
mercury link <conversation-id> main
```

Create spaces if needed:

```bash
mercury spaces create main
mercury spaces list
```

## Project Structure

```
mercury-assistant/
├── .env                 # Config & secrets (DO NOT COMMIT)
├── .env.example         # Template (safe to commit)
├── .mercury/
│   ├── extensions/      # Bundled: pdf, voice-transcribe (optional Mercury features also via dashboard / mercury add)
│   └── global/
│       ├── AGENTS.md    # Main agent instructions
│       ├── agents/      # Sub-agents (explore, worker)
│       ├── extensions/  # Subagent extension (framework)
│       └── skills/      # Skills (tasks, roles, etc.)
└── README.md
```

## Key Configuration (.env)

| Variable | Purpose |
|----------|---------|
| `MERCURY_GEMINI_API_KEY` | Google AI API key |
| `MERCURY_MODEL_PROVIDER` | `google` (or `anthropic`, `openai`) |
| `MERCURY_MODEL` | `gemini-2.5-flash` |
| `MERCURY_AGENT_IMAGE` | `mercury-agent:latest` (local build) |
| `MERCURY_ENABLE_WHATSAPP` | `true` to use WhatsApp |
| Voice (voice-transcribe) | See `.env.example` — `MERCURY_VOICE_ASR_DEVICE`, `MERCURY_VOICE_PYTHON` (optional) |
| Cloud TTS (optional **voice-synth** extension) | See `.env.example` — `MERCURY_TTS_PROVIDER`, Azure key/region and/or Google credentials path; use `mrctl tts synthesize` inside the agent |

## Building the Container (First Time)

The pre-built image `ghcr.io/michaelliv/mercury-agent:latest` is not publicly available. Build locally:

```bash
cd c:\code\agentic
git clone https://github.com/Michaelliv/mercury.git
cd mercury
docker build -f container/Dockerfile -t mercury-agent:latest .
```

Then in `.env`:

```env
MERCURY_AGENT_IMAGE=mercury-agent:latest
```

## Extending This Agent

### Change the LLM

Edit `.env`:

- **Anthropic**: `MERCURY_MODEL_PROVIDER=anthropic`, `MERCURY_MODEL=claude-sonnet-4-20250514`, `MERCURY_ANTHROPIC_API_KEY=...`
- **OpenAI**: `MERCURY_MODEL_PROVIDER=openai`, `MERCURY_MODEL=gpt-4o-mini`, `MERCURY_OPENAI_API_KEY=...`
- **Groq (free)**: `MERCURY_MODEL_PROVIDER=openai`, `MERCURY_OPENAI_BASE_URL=https://api.groq.com/openai/v1`, `MERCURY_OPENAI_API_KEY=<groq-key>`

### Add Discord or Slack

In `.env`:

```env
MERCURY_ENABLE_DISCORD=true
MERCURY_DISCORD_BOT_TOKEN=your-bot-token
```

Or for Slack:

```env
MERCURY_ENABLE_SLACK=true
MERCURY_SLACK_BOT_TOKEN=...
MERCURY_SLACK_SIGNING_SECRET=...
```

### Customize agent behavior

Edit `.mercury/global/AGENTS.md` — system instructions for the main agent.

### Add sub-agents

See `.mercury/global/agents/` (e.g. `explore.md`, `worker.md`). Users can say "Use explore to find X" or "Use worker to implement Y".

### Add extensions

```bash
mercury add @mercuryai/knowledge
mercury extensions list
```

**Bundled in this repo** (folders under `.mercury/extensions/`):

- **pdf** — PDF forms, extraction, and helper scripts (see each extension’s `skill/SKILL.md`)
- **voice-transcribe** — Local Whisper-based transcription; install Python deps from `voice-transcribe/requirements.txt` if you enable it
- **voice-synth** (install from dashboard / `mercury add`) — Google or Azure text-to-speech for English/Hebrew; host-only credentials; optional per-space auto voice via `voice-synth.auto`

**Also via registry / dashboard** (not vendored here): e.g. knowledge vault, web-browser, napkin — use `mercury add …` or **Features** in the dashboard. Optional Brave Search: `MERCURY_BRAVE_API_KEY` in `.env.example`.

## Multiple Agents

Each Mercury assistant is a **separate folder** with its own `.env` and `.mercury`. You can run different agents for different purposes:

```
c:\code\agentic\
├── mercury-assistant/       # Personal (this one)
├── mercury-assistant-work/  # Work-focused agent
└── mercury-assistant-family/# Family / shared agent
```

Create a new agent:

```bash
mkdir mercury-assistant-work
cd mercury-assistant-work
mercury init
# Edit .env with different config (e.g. different model, spaces)
```

Each folder can be its own **git repo**:

```bash
cd mercury-assistant
git init
git add .
git commit -m "Initial Mercury assistant"
```

Or use a monorepo with multiple agent folders — your choice.

## Useful Commands

| Command | Description |
|---------|-------------|
| `mercury run` | Start the assistant |
| `mercury chat "msg"` | Send a message (local test) |
| `mercury status` | Check status |
| `mercury doctor` | Validate Docker, credentials, adapters |
| `mercury auth whatsapp` | Pair WhatsApp |
| `mercury auth status` | Show auth state |
| `mercury spaces list` | List spaces |
| `mercury conversations --unlinked` | See unlinked chats |

## Security

- **Never commit `.env`** — it contains API keys. Use `.gitignore`.
- Rotate API keys if they are ever exposed.
- Add `.env` and `.mercury/global/auth.json` to `.gitignore`.

## Links

- [Mercury on GitHub](https://github.com/Michaelliv/mercury)
- [Mercury npm](https://www.npmjs.com/package/mercury-ai)
- [Google AI Studio](https://aistudio.google.com/apikey)
- [Gemini API](https://ai.google.dev/)
