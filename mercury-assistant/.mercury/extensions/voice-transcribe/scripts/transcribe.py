#!/usr/bin/env python3
"""Transcribe a single audio file; print one JSON line to stdout: {\"text\":\"...\"} or {\"error\":\"...\"}."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile


def _ensure_ffmpeg_on_path() -> None:
    """
    Transformers calls subprocess with argv[0] == `ffmpeg` (see audio_utils.ffmpeg_read).
    imageio-ffmpeg ships a versioned .exe (e.g. ffmpeg-win-x86_64-v7.1.exe). On Windows,
    Popen([...]) without shell=True will not run a .bat shim — it needs a real `ffmpeg.exe`
    on PATH. We hardlink (or copy) the vendored binary to `<temp>/mercury-voice-ffmpeg/ffmpeg.exe`.
    """
    if shutil.which("ffmpeg"):
        return
    try:
        import imageio_ffmpeg
    except ImportError:
        return
    src = imageio_ffmpeg.get_ffmpeg_exe()
    if not src or not os.path.isfile(src):
        return

    shim_root = os.path.join(tempfile.gettempdir(), "mercury-voice-ffmpeg")
    os.makedirs(shim_root, exist_ok=True)
    dst = os.path.join(shim_root, "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")

    if not os.path.exists(dst):
        try:
            os.link(src, dst)
        except OSError:
            try:
                shutil.copy2(src, dst)
            except OSError:
                return
    elif sys.platform != "win32":
        try:
            os.chmod(dst, 0o755)
        except OSError:
            pass

    os.environ["PATH"] = f"{shim_root}{os.pathsep}{os.environ.get('PATH', '')}"


def _asr_device():
    """Resolve torch device for ASR. Env: MERCURY_VOICE_ASR_DEVICE=cpu|cuda|auto (default auto)."""
    import torch

    raw = (os.environ.get("MERCURY_VOICE_ASR_DEVICE") or "").strip().lower()
    if not raw or raw == "auto":
        # Windows often reports CUDA but inference fails (drivers, OOM); CPU is the reliable default.
        if sys.platform == "win32":
            raw = "cpu"
        else:
            raw = "cuda" if torch.cuda.is_available() else "cpu"
    if raw in ("cpu", "-1"):
        return torch.device("cpu")
    if raw in ("cuda", "gpu", "cuda:0", "0"):
        if torch.cuda.is_available():
            return torch.device("cuda:0")
        return torch.device("cpu")
    return torch.device("cpu")


def main() -> None:
    ap = argparse.ArgumentParser(description="ASR for Mercury voice-transcribe (local provider)")
    ap.add_argument("--audio", required=True, help="Path to audio file on disk")
    ap.add_argument("--model", required=True, help="Hugging Face model id")
    args = ap.parse_args()

    try:
        from transformers import pipeline
    except ImportError as e:
        print(json.dumps({"error": f"transformers import failed: {e}"}))
        sys.exit(2)

    try:
        _ensure_ffmpeg_on_path()
        device = _asr_device()
        pipe = pipeline(
            "automatic-speech-recognition",
            model=args.model,
            device=device,
        )
        result = pipe(args.audio)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

    if isinstance(result, dict):
        text = (result.get("text") or "").strip()
    else:
        text = str(result).strip()
    print(json.dumps({"text": text}))


if __name__ == "__main__":
    main()
