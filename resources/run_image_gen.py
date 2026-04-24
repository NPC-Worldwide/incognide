#!/usr/bin/env python
"""
Shells out from Incognide to generate images via npcpy.gen.image_gen.

Reads a JSON payload on stdin, writes a JSON result to stdout.

Input:
  {
    "prompt": str,
    "n": int,
    "model": str,
    "provider": str,        # "openai" | "diffusers" | "gemini" | "ollama"
    "attachments": [str]|null,
    "base_filename": str,
    "output_dir": str,      # absolute path; created if missing
    "width": int,
    "height": int,
    "custom_model_path": str|null
  }

Output:
  { "success": true, "paths": ["/abs/path/image_0.png", ...] }
  or
  { "success": false, "error": "..." }

Requires npcpy (and, for provider=diffusers, torch+diffusers+transformers)
installed in the Python environment this script is invoked with.
"""
import json
import os
import sys
import traceback


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON on stdin: {e}"}))
        return 1

    prompt = payload.get("prompt") or ""
    n = int(payload.get("n") or 1)
    model = payload.get("model")
    provider = payload.get("provider")
    attachments = payload.get("attachments") or None
    base_filename = payload.get("base_filename") or "vixynt_gen_"
    output_dir = os.path.expanduser(payload.get("output_dir") or "~/.npcsh/images")
    width = int(payload.get("width") or 1024)
    height = int(payload.get("height") or 1024)
    custom_model_path = payload.get("custom_model_path") or None

    if not prompt:
        print(json.dumps({"success": False, "error": "Prompt is empty"}))
        return 1
    if not provider:
        print(json.dumps({"success": False, "error": "Provider is required"}))
        return 1

    try:
        os.makedirs(output_dir, exist_ok=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Could not create output dir {output_dir}: {e}"}))
        return 1

    try:
        from npcpy.gen.image_gen import generate_image
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"npcpy is not importable in this Python environment: {e}. Install it in the workspace venv via Team Management → Python Env."
        }))
        return 1

    try:
        images = generate_image(
            prompt=prompt,
            model=model,
            provider=provider,
            height=height,
            width=width,
            n_images=n,
            attachments=attachments,
            custom_model_path=custom_model_path,
        )
    except Exception as e:
        print(json.dumps({"success": False, "error": f"{type(e).__name__}: {e}", "traceback": traceback.format_exc()}))
        return 1

    paths = []
    for idx, img in enumerate(images or []):
        fname = f"{base_filename}{idx}.png"
        fpath = os.path.join(output_dir, fname)
        try:
            img.save(fpath)
            paths.append(fpath)
        except Exception as e:
            print(json.dumps({"success": False, "error": f"Could not save image {idx}: {e}"}))
            return 1

    print(json.dumps({"success": True, "paths": paths}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
