#!/usr/bin/env python
"""
Runs an instruction fine-tune job (SFT / USFT / DPO / memory_classifier) in the
workspace venv as a background process.

Reads the JSON payload on stdin. Writes status JSON to <status_file> as it
progresses.

Input (on stdin): superset of the serve.py finetune_instruction request body,
plus `job_id` and `status_file` injected by the Electron main process.

Status file schema: same shape as run_finetune_diffusers.py, plus `strategy`.

Requires npcpy with FT extras (torch, transformers, peft, trl) in the env.
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

    training_data = payload.get("trainingData") or []
    output_name = payload.get("outputName") or "my_instruction_model"
    base_model = payload.get("baseModel") or "google/gemma-3-270m-it"
    strategy = (payload.get("strategy") or "sft").lower()
    epochs = int(payload.get("epochs") or 20)
    learning_rate = float(payload.get("learningRate") or 3e-5)
    batch_size = int(payload.get("batchSize") or 2)
    lora_r = int(payload.get("loraR") or 8)
    lora_alpha = int(payload.get("loraAlpha") or 16)
    output_path = os.path.expanduser(payload.get("outputPath") or "~/.npcsh/models")
    system_prompt = payload.get("systemPrompt") or ""
    format_style = payload.get("formatStyle") or "gemma"
    npc_name = payload.get("npc")

    output_dir = os.path.join(output_path, output_name)

    status = {
        "status": "running",
        "job_id": job_id,
        "strategy": strategy,
        "output_dir": output_dir,
        "epochs": epochs,
        "current_epoch": 0,
        "current_loss": None,
        "loss_history": [],
        "step": 0,
        "start_time": datetime.datetime.now().isoformat(),
        "error": None,
    }
    if status_file:
        _write_status(status_file, status)

    if not training_data:
        status.update(status="error", error="No training data provided")
        if status_file:
            _write_status(status_file, status)
        return 1

    try:
        os.makedirs(output_dir, exist_ok=True)
    except Exception as e:
        status.update(status="error", error=f"Could not create output dir {output_dir}: {e}")
        if status_file:
            _write_status(status_file, status)
        return 1

    def on_progress(update: dict) -> None:
        status.update(update)
        if status_file:
            _write_status(status_file, status)

    try:
        if strategy == "sft":
            from npcpy.ft.sft import run_sft, SFTConfig
            cfg = SFTConfig(
                base_model=base_model,
                output_dir=output_dir,
                num_epochs=epochs,
                learning_rate=learning_rate,
                batch_size=batch_size,
                lora_r=lora_r,
                lora_alpha=lora_alpha,
                system_prompt=system_prompt,
                format_style=format_style,
            )
            run_sft(training_data, cfg, progress_callback=on_progress)
        elif strategy == "usft":
            from npcpy.ft.usft import run_usft, USFTConfig
            cfg = USFTConfig(
                base_model=base_model,
                output_dir=output_dir,
                num_epochs=epochs,
                learning_rate=learning_rate,
                batch_size=batch_size,
            )
            run_usft(training_data, cfg, progress_callback=on_progress)
        elif strategy == "dpo":
            from npcpy.ft.rl import train_with_dpo, RLConfig
            cfg = RLConfig(
                base_model=base_model,
                output_dir=output_dir,
                num_epochs=epochs,
                learning_rate=learning_rate,
                batch_size=batch_size,
                lora_r=lora_r,
                lora_alpha=lora_alpha,
            )
            train_with_dpo(training_data, cfg, progress_callback=on_progress)
        elif strategy == "memory_classifier":
            from npcpy.ft.memory_classifier import train_memory_classifier
            train_memory_classifier(
                training_data,
                output_dir=output_dir,
                num_epochs=epochs,
                learning_rate=learning_rate,
                batch_size=batch_size,
                progress_callback=on_progress,
            )
        else:
            raise ValueError(f"Unknown strategy: {strategy}")

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
