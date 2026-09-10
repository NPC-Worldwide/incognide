"""Stable experiment-facing wrappers around the Activity Intelligence predictor.

Experiment scripts should import training / inference / vocab helpers from here
rather than reaching into ``qstk.cnn`` directly. That keeps synthetic eval,
history ablation, and real-CSV analysis insulated when the studio action set
or predictor internals change (e.g. the v0.2.30 standardization).

Paper write-ups can stay private; this package is the public ML/experiment
surface that belongs in the Incognide repo.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

# Vocab + model I/O — single indirection point for action-set migrations.
from qstk.cnn import (  # noqa: F401
    ACTION_TO_IDX,
    ACTIVITY_TYPES,
    DEFAULT_CONFIG,
    forward,
    load as load_model,
    make_predictor,
    save as save_model,
)

from activity_model.activity_predictor import (  # noqa: F401
    NUM_FEATURES,
    encode_activity,
    events_to_sequences,
    train_from_sequences,
)

SequencePair = Tuple[np.ndarray, int]


def num_classes() -> int:
    return len(ACTIVITY_TYPES)


def action_name(idx: int) -> str:
    if 0 <= idx < len(ACTIVITY_TYPES):
        return ACTIVITY_TYPES[idx]
    return f"unknown:{idx}"


def predict_logits(
    model: Dict[str, Any],
    sequences: Sequence[SequencePair],
    batch_size: int = 32,
) -> Tuple[np.ndarray, np.ndarray]:
    """Return (logits [N, C], y_true [N]) for a list of (x, y) windows."""
    if not sequences:
        return np.zeros((0, num_classes()), dtype=np.float32), np.zeros((0,), dtype=np.int64)

    logits_all: List[np.ndarray] = []
    y_true: List[np.ndarray] = []
    for i in range(0, len(sequences), batch_size):
        batch = sequences[i : i + batch_size]
        xs = np.stack([b[0] for b in batch])
        ys = np.array([b[1] for b in batch])
        out = forward(model, xs)
        logits_all.append(out["action_logits"])
        y_true.append(ys)
    return np.concatenate(logits_all, axis=0), np.concatenate(y_true, axis=0)


def train_and_save(
    train_data: List[SequencePair],
    val_data: List[SequencePair],
    model_dir: str,
    *,
    epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 32,
    seed: Optional[int] = None,
    model_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Thin wrapper over ``train_from_sequences`` with experiment defaults."""
    return train_from_sequences(
        train_data,
        val_data,
        model_dir,
        epochs=epochs,
        lr=lr,
        batch_size=batch_size,
        seed=seed,
        model_config=model_config,
    )


def load_trained(model_dir: str) -> Dict[str, Any]:
    return load_model(os.path.join(model_dir, "model.npz"))
