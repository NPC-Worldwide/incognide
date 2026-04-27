#!/usr/bin/env python3
"""
Helper: derive sheet music from a recorded audio file.

Pipeline:
  1. Run demucs to separate the audio into stems (vocals/drums/bass/other).
  2. Run basic-pitch on each pitched stem (skip drums) to produce per-stem MIDI.
  3. Return the list of MIDI paths labelled by stem.

The Node IPC handler reads each MIDI and emits a multi-track MusicXML.

Reads {"audio_path": "...", "out_dir": "..."} from stdin.
Writes a single JSON line to stdout:
  {"success": true, "stems": [{"name": "vocals", "midi_path": "..."}]}
or {"success": false, "error": "..."}.

Optional payload key "skip_demucs": true → run basic-pitch directly on the input audio
(faster, monolithic transcription). Default false.
"""
import json
import os
import sys
import subprocess


def run_basic_pitch(audio_path, out_dir):
    """Run basic-pitch and return the MIDI path on success."""
    # scipy >=1.13 removed scipy.signal.gaussian — patch the alias
    try:
        import scipy.signal as _sps
        if not hasattr(_sps, "gaussian"):
            from scipy.signal.windows import gaussian as _gaussian
            _sps.gaussian = _gaussian
    except Exception:
        pass

    from basic_pitch.inference import predict_and_save
    from basic_pitch import ICASSP_2022_MODEL_PATH
    import basic_pitch as _bp

    model_dir = os.path.join(os.path.dirname(_bp.__file__), "saved_models", "icassp_2022")
    candidates = []
    if sys.platform == "darwin":
        candidates.append(os.path.join(model_dir, "nmp.mlpackage"))
    candidates += [
        os.path.join(model_dir, "nmp.onnx"),
        os.path.join(model_dir, "nmp.tflite"),
        ICASSP_2022_MODEL_PATH,
    ]
    chosen = next((p for p in candidates if os.path.exists(p)), ICASSP_2022_MODEL_PATH)

    os.makedirs(out_dir, exist_ok=True)
    predict_and_save(
        [audio_path],
        out_dir,
        save_midi=True,
        sonify_midi=False,
        save_model_outputs=False,
        save_notes=False,
        model_or_model_path=chosen,
    )
    base = os.path.splitext(os.path.basename(audio_path))[0]
    for cand in (
        os.path.join(out_dir, f"{base}_basic_pitch.mid"),
        os.path.join(out_dir, f"{base}_basic_pitch.midi"),
    ):
        if os.path.exists(cand):
            return cand
    # Fall back: any .mid in dir matching base
    for fn in os.listdir(out_dir):
        if fn.endswith(".mid") and base in fn:
            return os.path.join(out_dir, fn)
    return None


def run_demucs(audio_path, out_dir):
    """Run demucs and return a dict {stem_name: stem_wav_path}."""
    os.makedirs(out_dir, exist_ok=True)
    # Use the htdemucs default model (4 stems: vocals/drums/bass/other)
    # --two-stems is faster but loses musicality; we want the four-stem split.
    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", "htdemucs",
        "--out", out_dir,
        audio_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"demucs failed (exit {proc.returncode}): {proc.stderr[-500:]}")
    # demucs writes to <out_dir>/htdemucs/<basename>/{vocals,drums,bass,other}.wav
    base = os.path.splitext(os.path.basename(audio_path))[0]
    stem_dir = os.path.join(out_dir, "htdemucs", base)
    if not os.path.isdir(stem_dir):
        raise RuntimeError(f"demucs produced no stem dir at {stem_dir}")
    out = {}
    for stem in ("vocals", "bass", "other", "drums"):
        p = os.path.join(stem_dir, f"{stem}.wav")
        if os.path.exists(p):
            out[stem] = p
    return out


def main():
    payload = {}
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        print(json.dumps({"success": False, "error": f"bad payload: {e}"}))
        return

    audio_path = payload.get("audio_path")
    out_dir = payload.get("out_dir")
    skip_demucs = bool(payload.get("skip_demucs", False))
    if not audio_path or not os.path.exists(audio_path):
        print(json.dumps({"success": False, "error": f"audio_path missing or not found: {audio_path}"}))
        return
    if not out_dir:
        out_dir = os.path.dirname(audio_path)
    os.makedirs(out_dir, exist_ok=True)

    if skip_demucs:
        try:
            print(f"[derive] running basic-pitch directly on {audio_path}", file=sys.stderr, flush=True)
            midi_path = run_basic_pitch(audio_path, out_dir)
            if not midi_path:
                print(json.dumps({"success": False, "error": "basic-pitch produced no MIDI"}))
                return
            print(json.dumps({"success": True, "stems": [{"name": "all", "midi_path": midi_path}]}))
            return
        except Exception as e:
            print(json.dumps({"success": False, "error": f"basic-pitch failed: {e}"}))
            return

    # Stem-separation pipeline
    try:
        print(f"[derive] running demucs on {audio_path}", file=sys.stderr, flush=True)
        stems = run_demucs(audio_path, out_dir)
        if not stems:
            print(json.dumps({"success": False, "error": "demucs produced no stems"}))
            return
    except Exception as e:
        print(json.dumps({"success": False, "error": f"demucs failed: {e}"}))
        return

    results = []
    # Skip drums for pitch transcription; basic-pitch on percussion is noise
    pitched_stems = [s for s in ("vocals", "bass", "other") if s in stems]
    bp_dir = os.path.join(out_dir, "midi")
    os.makedirs(bp_dir, exist_ok=True)
    for stem_name in pitched_stems:
        stem_audio = stems[stem_name]
        try:
            print(f"[derive] basic-pitch on {stem_name}: {stem_audio}", file=sys.stderr, flush=True)
            midi_path = run_basic_pitch(stem_audio, bp_dir)
            if midi_path:
                results.append({"name": stem_name, "midi_path": midi_path})
        except Exception as e:
            print(f"[derive] basic-pitch failed on {stem_name}: {e}", file=sys.stderr, flush=True)

    if not results:
        print(json.dumps({"success": False, "error": "no stems transcribed"}))
        return
    print(json.dumps({"success": True, "stems": results}))


if __name__ == "__main__":
    main()
