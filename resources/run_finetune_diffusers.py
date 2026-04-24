#!/usr/bin/env python
"""
Runs a diffusers fine-tune job in the workspace venv as a background process.

Reads the JSON payload on stdin. Writes status JSON to <status_file> as it
progresses, so the Electron main process can poll for progress without
holding the subprocess open.

Input (on stdin):
  {
    "images": [abs paths],
    "captions": [str, ...],          # same length as images, may be []
    "output_name": str,
    "output_path": str,              # directory where the finetuned model lands
    "epochs": int,
    "batch_size": int,
    "learning_rate": float,
    "job_id": str,
    "status_file": str               # absolute path; this process writes JSON here
  }

Status file schema (written repeatedly):
  {
    "status": "running" | "complete" | "error",
    "job_id": str,
    "output_dir": str,
    "epochs": int,
    "current_epoch": int,
    "current_batch": int,
    "total_batches": int,
    "current_loss": float|null,
    "loss_history": [float, ...],
    "step": int,
    "start_time": iso-string,
    "error": str|null
  }

Requires npcpy with diffusers/torch extras in the Python env.
"""
import datetime
import json
import os
import sys
import traceback


def _write_status(status_file: str, status: dict) -> None:
    try:
        tmp = status_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(status, f)
        os.replace(tmp, status_file)
    except Exception:
        pass


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        sys.stderr.write(f"Invalid JSON on stdin: {e}\n")
        return 1

    job_id = payload.get("job_id") or f"ft_{int(datetime.datetime.now().timestamp())}"
    status_file = payload.get("status_file")
    images = [os.path.expanduser(p) for p in (payload.get("images") or [])]
    captions = payload.get("captions") or [""] * len(images)
    output_name = payload.get("output_name") or "my_diffusion_model"
    output_path = os.path.expanduser(payload.get("output_path") or "~/.npcsh/models")
    epochs = int(payload.get("epochs") or 100)
    batch_size = int(payload.get("batch_size") or 4)
    learning_rate = float(payload.get("learning_rate") or 1e-4)

    output_dir = os.path.join(output_path, output_name)

    status = {
        "status": "running",
        "job_id": job_id,
        "output_dir": output_dir,
        "epochs": epochs,
        "current_epoch": 0,
        "current_batch": 0,
        "total_batches": 0,
        "current_loss": None,
        "loss_history": [],
        "step": 0,
        "start_time": datetime.datetime.now().isoformat(),
        "error": None,
    }
    if status_file:
        _write_status(status_file, status)

    if not images:
        status.update(status="error", error="No images provided")
        if status_file:
            _write_status(status_file, status)
        return 1

    try:
        from npcpy.ft.diff import finetune_diffusers
    except Exception as e:
        status.update(status="error", error=f"npcpy.ft.diff not importable: {e}")
        if status_file:
            _write_status(status_file, status)
        return 1

    def on_progress(update: dict) -> None:
        status.update(update)
        if status_file:
            _write_status(status_file, status)

    try:
        os.makedirs(output_dir, exist_ok=True)
        finetune_diffusers(
            images=images,
            captions=captions,
            output_dir=output_dir,
            epochs=epochs,
            batch_size=batch_size,
            learning_rate=learning_rate,
            progress_callback=on_progress,
        )
        status.update(status="complete")
        if status_file:
            _write_status(status_file, status)
        return 0
    except Exception as e:
        status.update(status="error", error=f"{type(e).__name__}: {e}", traceback=traceback.format_exc())
        if status_file:
            _write_status(status_file, status)
        return 1


if __name__ == "__main__":
    sys.exit(main())
