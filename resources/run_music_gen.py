#!/usr/bin/env python
"""
Shells out from Incognide to generate music via npcpy.gen.audio_gen.generate_music.

Reads a JSON payload on stdin, writes a JSON result to stdout.

Input:
  {
    "prompt": str,
    "provider": str,        # "local" | "musicgen" | "transformers" | "meta" (local)
    "model": str|null,
    "duration": int,
    "output_dir": str,      # absolute path
    "base_filename": str,
    "api_key": str|null
  }

Output:
  { "success": true, "path": "/abs/path/track.wav", "format": "wav", "provider": "...", "model": "..." }
  or
  { "success": false, "error": "..." }

Requires npcpy (and, for local providers, torch+transformers) in this venv.
"""
import json
import os
import sys
import time
import traceback


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON on stdin: {e}"}))
        return 1

    prompt = payload.get("prompt") or ""
    provider = payload.get("provider") or "local"
    model = payload.get("model")
    duration = int(payload.get("duration") or 10)
    output_dir = os.path.expanduser(payload.get("output_dir") or "~/.npcsh/audio")
    base_filename = payload.get("base_filename") or f"scherzo_gen_{int(time.time())}"
    api_key = payload.get("api_key")

    if not prompt:
        print(json.dumps({"success": False, "error": "Prompt is empty"}))
        return 1

    try:
        os.makedirs(output_dir, exist_ok=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Could not create output dir {output_dir}: {e}"}))
        return 1

    try:
        from npcpy.gen.audio_gen import generate_music
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"npcpy is not importable in this Python environment: {e}. Install it in the workspace venv via Team Management → Python Env."
        }))
        return 1

    try:
        result = generate_music(
            prompt=prompt,
            provider=provider,
            model=model,
            duration=duration,
            api_key=api_key,
        )
    except Exception as e:
        print(json.dumps({"success": False, "error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()}))
        return 1

    audio = result.get("audio")
    fmt = result.get("format") or "wav"
    used_provider = result.get("provider") or provider
    used_model = result.get("model") or model

    if audio is None:
        print(json.dumps({"success": False, "error": "generate_music returned no audio"}))
        return 1

    fname = f"{base_filename}.{fmt}"
    fpath = os.path.join(output_dir, fname)
    try:
        if isinstance(audio, (bytes, bytearray)):
            with open(fpath, "wb") as f:
                f.write(audio)
        else:
            try:
                audio.save(fpath)
            except AttributeError:
                with open(fpath, "wb") as f:
                    f.write(audio)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Could not save audio: {e}"}))
        return 1

    print(json.dumps({"success": True, "path": fpath, "format": fmt, "provider": used_provider, "model": used_model}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
