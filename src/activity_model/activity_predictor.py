"""
Activity Intelligence Model — qstk SSM-based next-action prediction.

Functional. No classes. No pickle, no json.

Wraps qstk.cnn functional API with:
  - SQLite data loading from incognide local DB
  - Gradient-based training with Adam (exact torch autograd)
  - Continuous / periodic retraining
  - Base weight shifting for continual learning
  - HuggingFace hub download for base models
"""

import math
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# qstk imports (functional)
# ---------------------------------------------------------------------------

try:
    from qstk.cnn import (
        make_predictor,
        forward,
        predict as predict_fn,
        save as save_model,
        load as load_model,
        shift_base_weights,
        forward_backward,
        ACTION_TO_IDX,
        DEFAULT_CONFIG,
    )
    HAS_QSTK = True
except ImportError:
    HAS_QSTK = False
    raise

# ---------------------------------------------------------------------------
# HuggingFace hub (optional — for downloading base weights)
# ---------------------------------------------------------------------------

try:
    from huggingface_hub import hf_hub_download
    HAS_HF = True
except ImportError:
    HAS_HF = False

# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

HOURS_PER_DAY = 24
DAYS_PER_WEEK = 7
NUM_FEATURES = 25


def _time_features(timestamp: str) -> np.ndarray:
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except Exception:
        dt = datetime.now(timezone.utc)
    hour = dt.hour
    dow = dt.weekday()
    return np.array([
        math.sin(2 * math.pi * hour / HOURS_PER_DAY),
        math.cos(2 * math.pi * hour / HOURS_PER_DAY),
        math.sin(2 * math.pi * dow / DAYS_PER_WEEK),
        math.cos(2 * math.pi * dow / DAYS_PER_WEEK),
    ], dtype=np.float32)


def _delta_feature(ts_curr: str, ts_prev: Optional[str]) -> float:
    if ts_prev is None:
        return 0.0
    try:
        t1 = datetime.fromisoformat(ts_curr.replace('Z', '+00:00'))
        t0 = datetime.fromisoformat(ts_prev.replace('Z', '+00:00'))
        delta = (t1 - t0).total_seconds()
        return math.log1p(max(delta, 0))
    except Exception:
        return 0.0


def encode_activity(
    activity_type: str,
    timestamp: str,
    data: Dict[str, Any],
    prev_timestamp: Optional[str] = None,
) -> np.ndarray:
    type_onehot = np.zeros(len(ACTION_TO_IDX), dtype=np.float32)
    if activity_type in ACTION_TO_IDX:
        type_onehot[ACTION_TO_IDX[activity_type]] = 1.0

    tfeat = _time_features(timestamp)
    delta = np.array([_delta_feature(timestamp, prev_timestamp)], dtype=np.float32)

    has_url = 1.0 if data.get('url') else 0.0
    has_file = 1.0 if data.get('filePath') or data.get('fileName') else 0.0
    has_command = 1.0 if data.get('command') else 0.0
    has_query = 1.0 if data.get('query') else 0.0
    ctx = np.array([has_url, has_file, has_command, has_query], dtype=np.float32)

    return np.concatenate([type_onehot, tfeat, delta, ctx])


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def load_activity_sequences(db_path: str, max_seq_len: int = 50, min_seq_len: int = 5) -> List[Tuple[np.ndarray, int]]:
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    events = []

    for table, typ, ts_col in [
        ('activity_log', 'activity_type', 'timestamp'),
        ('browser_history', 'website_visit', 'last_visited'),
        ('command_history', 'terminal_command', 'timestamp'),
        ('jinx_executions', 'jinx_execution', 'timestamp'),
        ('memory_lifecycle', 'memory_created', 'timestamp'),
    ]:
        try:
            rows = cursor.execute(
                f"SELECT * FROM {table} WHERE {ts_col} IS NOT NULL ORDER BY {ts_col}"
            ).fetchall()
            for row in rows:
                data = {}
                try:
                    raw = row.get('activity_data') or row.get('input') or row.get('output')
                    if isinstance(raw, str):
                        data = __import__('json').loads(raw)
                except Exception:
                    pass
                for k in ['url', 'title', 'command', 'jinx_name', 'filePath', 'fileName', 'query', 'initial_memory', 'npc']:
                    if k in row.keys() and row[k] is not None:
                        data[k] = row[k]
                events.append({
                    'type': row[typ] if typ != 'activity_type' else row['activity_type'],
                    'timestamp': row[ts_col],
                    'data': data,
                })
        except Exception:
            pass

    conn.close()
    events.sort(key=lambda e: e['timestamp'] or '')

    sequences = []
    for i in range(min_seq_len, len(events)):
        seq_events = events[max(0, i - max_seq_len):i]
        target_event = events[i]

        seq_feats = []
        prev_ts = None
        for e in seq_events:
            feat = encode_activity(e['type'], e['timestamp'], e['data'], prev_ts)
            seq_feats.append(feat)
            prev_ts = e['timestamp']

        seq_array = np.stack(seq_feats, axis=0)
        if seq_array.shape[0] < max_seq_len:
            pad = np.zeros((max_seq_len - seq_array.shape[0], NUM_FEATURES), dtype=np.float32)
            seq_array = np.concatenate([pad, seq_array], axis=0)
        else:
            seq_array = seq_array[-max_seq_len:]

        target_idx = ACTION_TO_IDX.get(target_event['type'], len(ACTION_TO_IDX) - 1)
        sequences.append((seq_array, target_idx))

    return sequences


# ---------------------------------------------------------------------------
# HF hub download
# ---------------------------------------------------------------------------

def download_base_weights(model_dir: str, repo_id: str, filename: str = "model.npz") -> Optional[str]:
    """Download base model weights from HuggingFace hub.

    Args:
        model_dir: local directory to cache the file.
        repo_id: HuggingFace repo id, e.g. "npcww/activity-intelligence-base".
        filename: name of the npz file in the repo.

    Returns:
        path to the downloaded npz, or None if failed.
    """
    if not HAS_HF:
        print("huggingface_hub not installed. Run: pip install huggingface_hub")
        return None
    os.makedirs(model_dir, exist_ok=True)
    try:
        local_path = hf_hub_download(repo_id=repo_id, filename=filename, local_dir=model_dir)
        return local_path
    except Exception as e:
        print(f"HF download failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_model(
    db_path: str,
    model_dir: str,
    epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 32,
    shift_base: bool = False,
    base_repo_id: Optional[str] = None,
) -> Dict[str, Any]:
    sequences = load_activity_sequences(db_path)
    if len(sequences) < 10:
        return {'error': f'Need >= 10 sequences, got {len(sequences)}.'}

    os.makedirs(model_dir, exist_ok=True)
    npz_path = os.path.join(model_dir, 'model.npz')

    # Load or create model
    if os.path.exists(npz_path):
        model = load_model(npz_path)
    elif base_repo_id and HAS_HF:
        downloaded = download_base_weights(model_dir, base_repo_id)
        if downloaded:
            model = load_model(downloaded)
        else:
            model = make_predictor({'feature_dim': NUM_FEATURES})
    else:
        model = make_predictor({'feature_dim': NUM_FEATURES})

    # Optionally shift base weights before fine-tuning
    if shift_base and os.path.exists(npz_path):
        print("Shifting base weights before fine-tuning...")
        shift_base_weights(model, shift_scale=0.01)

    # Manual Adam state
    m = {k: np.zeros_like(v) for k, v in model['params'].items()}
    v2 = {k: np.zeros_like(v) for k, v in model['params'].items()}
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    t_step = 0

    np.random.shuffle(sequences)
    split = int(0.8 * len(sequences))
    train_data = sequences[:split]
    val_data = sequences[split:]

    best_val_acc = 0.0
    history = []

    for epoch in range(epochs):
        np.random.shuffle(train_data)
        total_loss = 0.0
        correct = 0
        total = 0

        for i in range(0, len(train_data), batch_size):
            batch = train_data[i:i + batch_size]
            xs = np.stack([b[0] for b in batch])
            ys = np.array([b[1] for b in batch])

            loss, grads = forward_backward(model, xs, ys)
            t_step += 1

            for k in model['params']:
                g = grads[k]
                m[k] = beta1 * m[k] + (1 - beta1) * g
                v2[k] = beta2 * v2[k] + (1 - beta2) * (np.abs(g) ** 2)
                m_hat = m[k] / (1 - beta1 ** t_step)
                v_hat = v2[k] / (1 - beta2 ** t_step)
                model['params'][k] -= lr * m_hat / (np.sqrt(v_hat) + eps)

            out = forward(model, xs)
            preds = np.argmax(out['action_logits'], axis=1)
            correct += int(np.sum(preds == ys))
            total += len(batch)
            total_loss += loss * len(batch)

        train_acc = correct / total if total > 0 else 0
        avg_loss = total_loss / total if total > 0 else 0

        # Validation
        val_correct = 0
        val_total = 0
        for i in range(0, len(val_data), batch_size):
            batch = val_data[i:i + batch_size]
            xs = np.stack([b[0] for b in batch])
            ys = np.array([b[1] for b in batch])
            out = forward(model, xs)
            preds = np.argmax(out['action_logits'], axis=1)
            val_correct += int(np.sum(preds == ys))
            val_total += len(batch)

        val_acc = val_correct / val_total if val_total > 0 else 0
        history.append({'epoch': epoch + 1, 'loss': float(avg_loss), 'train_acc': float(train_acc), 'val_acc': float(val_acc)})

        print(f"Epoch {epoch + 1}/{epochs}  loss={avg_loss:.4f}  train_acc={train_acc:.3f}  val_acc={val_acc:.3f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            save_model(model, npz_path)

    return {
        'success': True,
        'sequences': len(sequences),
        'best_val_acc': float(best_val_acc),
        'history': history,
    }


# ---------------------------------------------------------------------------
# Continuous training (lightweight incremental update)
# ---------------------------------------------------------------------------

def incremental_train(
    db_path: str,
    model_dir: str,
    epochs: int = 3,
    lr: float = 5e-4,
    batch_size: int = 32,
) -> Dict[str, Any]:
    """Lightweight fine-tune on newest data. Shifts base weights first."""
    return train_model(
        db_path=db_path,
        model_dir=model_dir,
        epochs=epochs,
        lr=lr,
        batch_size=batch_size,
        shift_base=True,
    )


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def predict_next_action(db_path: str, model_dir: str) -> Optional[Dict[str, Any]]:
    npz_path = os.path.join(model_dir, 'model.npz')
    if not os.path.exists(npz_path):
        return None

    model = load_model(npz_path)
    sequences = load_activity_sequences(db_path, max_seq_len=50, min_seq_len=1)
    if not sequences:
        return None

    recent_seq, _ = sequences[-1]
    return predict_fn(model, recent_seq)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import argparse
    import json as json_mod

    parser = argparse.ArgumentParser()
    parser.add_argument('--db-path', required=True)
    parser.add_argument('--model-dir', default=os.path.expanduser('~/.incognide/activity_model'))
    parser.add_argument('command', choices=['train', 'predict', 'incremental'])
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--shift-base', action='store_true')
    parser.add_argument('--base-repo-id', default=None, help='HuggingFace repo for base weights')
    args = parser.parse_args()

    if args.command == 'train':
        result = train_model(
            args.db_path, args.model_dir,
            epochs=args.epochs, lr=args.lr,
            shift_base=args.shift_base,
            base_repo_id=args.base_repo_id,
        )
    elif args.command == 'incremental':
        result = incremental_train(args.db_path, args.model_dir, epochs=args.epochs, lr=args.lr)
    elif args.command == 'predict':
        result = predict_next_action(args.db_path, args.model_dir)
        if result is None:
            result = {'error': 'No model or data available.'}

    print(json_mod.dumps(result, indent=2))
