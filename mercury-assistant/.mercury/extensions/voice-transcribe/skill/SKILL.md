---
name: voice-transcribe
description: Voice notes are transcribed to text before the agent runs (local Python or Hugging Face Inference API).
---

# Voice transcription

When a user sends a **voice note** or **audio** attachment, Mercury runs the `voice-transcribe` extension **before** the container starts. The transcript is appended to the user message as a `[Voice transcript]` block. You receive normal text — you do not need to read or play audio files for intent.

## Configuration (per space)

| Key | Purpose |
|-----|---------|
| `voice-transcribe.provider` | `local` (default) or `api` |
| `voice-transcribe.model` | Hugging Face model id (default `mike249/whisper-tiny-he-2` for local Hebrew) |

### Local provider (`local`)

Runs `scripts/transcribe.py` on the **Mercury host** with [Transformers](https://huggingface.co/docs/transformers) `pipeline("automatic-speech-recognition", model=...)`.

1. Install on the same machine that runs Mercury:

   ```bash
   pip install -r /path/to/.mercury/extensions/voice-transcribe/requirements.txt
   ```

   Or: `pip install "transformers>=4.40.0" "torch>=2.0.0" "imageio-ffmpeg>=0.4.9"`

   **Telegram voice** is usually `.ogg` (Opus). Transformers shells out to an executable literally named `ffmpeg`; `transcribe.py` uses `imageio-ffmpeg`’s binary and exposes it as `ffmpeg` / `ffmpeg.exe` on `PATH` (hardlink or copy under `%TEMP%\\mercury-voice-ffmpeg` on Windows). Installing system ffmpeg on `PATH` also works (e.g. `winget install Gyan.FFmpeg`).

2. Optional host `.env`:
   - `MERCURY_VOICE_PYTHON` — Python executable (default: `python` on Windows, `python3` elsewhere)
   - `MERCURY_VOICE_TRANSCRIBE_TIMEOUT_MS` — subprocess timeout in ms (default `300000`)
   - `MERCURY_VOICE_ASR_DEVICE` — `cpu`, `cuda`, or `auto`. On Windows the default is **CPU** (CUDA often looks available but fails at inference). Set `cuda` if you have a working GPU stack.

Hub messages like *Xet Storage… hf_xet* are warnings only, not the cause of failures.

First run downloads the model into the Hugging Face cache (~100–200MB for tiny). **Each voice note spawns a new Python process**, so the first transcription after Mercury starts can be slow while the model loads.

### API provider (`api`)

POSTs audio to `https://api-inference.huggingface.co/models/<model>`. Requires `MERCURY_HF_TOKEN` on the host. Pick a model that has an [Inference Provider](https://huggingface.co/docs/api-inference) on its Hub page (e.g. `openai/whisper-large-v3`). Hebrew-tuned models such as [mike249/whisper-tiny-he-2](https://huggingface.co/mike249/whisper-tiny-he-2) often have **no** hosted provider — use **`local`** for those.

## RBAC

Only callers with the `voice-transcribe` permission (default: admin + member) get transcription. Others keep the raw message without an appended transcript.
