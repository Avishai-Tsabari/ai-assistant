---
name: voice-synth
description: Cloud text-to-speech (Google or Azure) for English and Hebrew — on-demand via mrctl or optional auto voice attachments per space.
---

# Voice synthesis (TTS)

The host can turn assistant text into **MP3** using **Google Cloud Text-to-Speech** or **Azure Speech**. Credentials stay on the Mercury host (not in the container).

## On-demand vs automatic

| Setting | Behavior |
|--------|----------|
| **`voice-synth.mode=on_demand`** (default) | TTS runs only when **you** call `mrctl tts synthesize` and write a real audio file under `outbox/` (e.g. `.mp3`). |
| **`voice-synth.mode=auto`** | After every assistant text reply, the host attaches a TTS **MP3** automatically (same permission and credentials). |

Set with `mrctl config set voice-synth.mode on_demand` or `auto`. Legacy: `voice-synth.auto=true` still works if `mode` was never set.

## On-demand: how to attach real audio

When the user asks for a **voice message** or **audio reply**, you must synthesize speech — **do not** create a `.txt` file or use misleading names like `something.ogg.txt`. Chat apps decide how to render attachments from the **file extension and MIME type**; a `.txt` file is plain text, not playable audio.

```bash
mrctl tts synthesize --text "Your spoken reply here" --out outbox/reply.mp3
```

Optional flags:

- `--language` — `auto` (default), `he-IL`, or `en-US`. `auto` picks Hebrew if the text contains Hebrew script.
- `--provider` — `google`, `azure`, or `auto` (host default from `MERCURY_TTS_PROVIDER`).

Requires the caller to have **`tts.synthesize`** permission (admins have it by default; members need an admin to grant it).

### Telegram / WhatsApp delivery

Mercury sends `outbox/` files through each platform’s APIs. **Telegram** uses `sendAudio` for MP3 (in-chat player) and `sendVoice` for OGG voice notes. **WhatsApp** treats audio as a voice note when the filename matches **`voice-*.ogg`** (case-insensitive); otherwise it sends as normal audio (`ptt: false`).

## Host configuration

Set one or both providers on the machine that runs Mercury:

| Variable | Purpose |
|----------|---------|
| `MERCURY_TTS_PROVIDER` | `google`, `azure`, or `auto` (pick Google if a credentials file is set, else Azure) |
| `MERCURY_AZURE_SPEECH_KEY` / `MERCURY_AZURE_SPEECH_REGION` | Azure Speech |
| `MERCURY_GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account JSON |

Optional: `MERCURY_TTS_MAX_CHARS` (default 5000) caps input length per request.

Restart Mercury after changing `.env`.
