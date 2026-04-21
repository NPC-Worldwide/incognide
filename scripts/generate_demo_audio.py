"""Generate demo audio samples bundled with the app (assets/demo_audio/).

Run once from the repo root:
    python scripts/generate_demo_audio.py

Uses the vendored MLX MusicGen in npcpy (native Apple Silicon, no PyTorch).
"""
import os
from npcpy.gen.audio_gen import generate_music

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "demo_audio")
OUT_DIR = os.path.abspath(OUT_DIR)

DEMOS = [
    ("demo_house_beat.wav",  "punchy four-on-the-floor house beat, 124bpm, clean hi-hats"),
    ("demo_funky_bass.wav",  "funky slap bass loop in A minor, groovy, 110bpm"),
    ("demo_synth_lead.wav",  "uplifting analog synth lead melody, 120bpm, major key"),
    ("demo_ambient_pad.wav", "warm ambient pad, slow evolving, dreamy, no drums"),
]

os.makedirs(OUT_DIR, exist_ok=True)
for fname, prompt in DEMOS:
    fpath = os.path.join(OUT_DIR, fname)
    if os.path.exists(fpath) and os.path.getsize(fpath) > 1024:
        print(f"skip  {fname} (exists)")
        continue
    print(f"gen   {fname}  →  {prompt!r}")
    result = generate_music(prompt=prompt, provider="local", duration=8)
    with open(fpath, "wb") as f:
        f.write(result["audio"])
    print(f"      wrote {os.path.getsize(fpath)} bytes via {result['provider']}")

print(f"\nDone. {len(DEMOS)} samples in {OUT_DIR}")
