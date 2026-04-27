#!/usr/bin/env python3
"""
Helper: run basic-pitch on an audio file and print the resulting MIDI path as JSON.

Reads {"audio_path": "...", "out_dir": "..."} from stdin.
Writes a single JSON line to stdout: {"success": true, "midi_path": "..."} or {"success": false, "error": "..."}.

basic-pitch must be installed in the Python env that runs this script:
    pip install basic-pitch
"""
import json
import os
import sys


def main():
    payload = {}
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        print(json.dumps({"success": False, "error": f"bad payload: {e}"}))
        return

    audio_path = payload.get("audio_path")
    out_dir = payload.get("out_dir")
    if not audio_path or not os.path.exists(audio_path):
        print(json.dumps({"success": False, "error": f"audio_path missing or not found: {audio_path}"}))
        return
    if not out_dir:
        out_dir = os.path.dirname(audio_path)
    os.makedirs(out_dir, exist_ok=True)

    try:
        from basic_pitch.inference import predict_and_save
        from basic_pitch import ICASSP_2022_MODEL_PATH
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": (
                "basic-pitch not installed in the Python env this script runs in. "
                f"Install with: pip install basic-pitch  (importerror: {e})"
            ),
        }))
        return

    try:
        predict_and_save(
            [audio_path],
            out_dir,
            save_midi=True,
            sonify_midi=False,
            save_model_outputs=False,
            save_notes=False,
            model_or_model_path=ICASSP_2022_MODEL_PATH,
        )
    except Exception as e:
        print(json.dumps({"success": False, "error": f"basic-pitch inference failed: {e}"}))
        return

    base = os.path.splitext(os.path.basename(audio_path))[0]
    # basic-pitch's default output suffix
    candidates = [
        os.path.join(out_dir, f"{base}_basic_pitch.mid"),
        os.path.join(out_dir, f"{base}_basic_pitch.midi"),
    ]
    midi_path = next((p for p in candidates if os.path.exists(p)), None)
    if not midi_path:
        # Fall back: scan the dir for any new .mid file
        for fn in os.listdir(out_dir):
            if fn.endswith(".mid") and base in fn:
                midi_path = os.path.join(out_dir, fn)
                break
    if not midi_path:
        print(json.dumps({"success": False, "error": "basic-pitch ran but no MIDI file was produced"}))
        return

    print(json.dumps({"success": True, "midi_path": midi_path}))


if __name__ == "__main__":
    main()
