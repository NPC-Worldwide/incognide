"""
Activity Intelligence Model — SSM-based next-action prediction.

Inspired by qllm-private's diagonal selective SSM, but simplified for
real-valued discrete sequence prediction over user activity events.

Architecture:
  - Embed activity types + temporal features + context
  - Diagonal SSM layers with input-dependent decay (selective memory)
  - Classification head: next action class (softmax)
  - Parameter heads: action-specific metadata (e.g. domain, file type)

The state equation is:
    h[t] = diag(A_t) * h[t-1] + B_t * x[t]
    y[t] = C * h[t]

where A_t = exp(-dt * decay) is input-dependent, giving content-selective
memory length. Multiple timescales are learned via different decay rates.
"""

import json
import math
import os
import sqlite3
import time
import pickle
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Any

import numpy as np

# ---------------------------------------------------------------------------
# Optional PyTorch path
# ---------------------------------------------------------------------------

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ACTIVITY_TYPES = [
    'pane_open', 'pane_close', 'pane_focus',
    'file_open', 'file_edit',
    'website_visit',
    'terminal_command',
    'chat_message',
    'app_switch',
    'search_query',
    'model_change',
    'click',
    'keyboard_shortcut',
    'text_input',
    'jinx_execution',
    'memory_created',
]

TYPE_TO_IDX = {t: i for i, t in enumerate(ACTIVITY_TYPES)}
NUM_ACTION_CLASSES = len(ACTIVITY_TYPES)

# Time buckets for cyclic encoding
HOURS_PER_DAY = 24
DAYS_PER_WEEK = 7

# ---------------------------------------------------------------------------
# Feature extraction
# ---------------------------------------------------------------------------

def _extract_domain(url: str) -> str:
    try:
        from urllib.parse import urlparse
        return urlparse(url).netloc or url
    except Exception:
        return url

def _extract_file_extension(path: str) -> str:
    if not path:
        return ''
    ext = os.path.splitext(path)[1].lower()
    return ext if ext else 'none'

def _time_features(timestamp: str) -> np.ndarray:
    """Cyclic encoding of hour and day-of-week."""
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
    """Seconds since previous event, log-scaled."""
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
    """Encode one activity event into a fixed-length feature vector."""
    # One-hot activity type
    type_onehot = np.zeros(NUM_ACTION_CLASSES, dtype=np.float32)
    if activity_type in TYPE_TO_IDX:
        type_onehot[TYPE_TO_IDX[activity_type]] = 1.0

    # Time features
    tfeat = _time_features(timestamp)
    delta = np.array([_delta_feature(timestamp, prev_timestamp)], dtype=np.float32)

    # Context features (small, fixed set)
    has_url = 1.0 if data.get('url') else 0.0
    has_file = 1.0 if data.get('filePath') or data.get('fileName') else 0.0
    has_command = 1.0 if data.get('command') else 0.0
    has_query = 1.0 if data.get('query') else 0.0

    ctx = np.array([has_url, has_file, has_command, has_query], dtype=np.float32)

    return np.concatenate([type_onehot, tfeat, delta, ctx])  # shape: (24,)

FEATURE_DIM = NUM_ACTION_CLASSES + 4 + 1 + 4  # = 24

# ---------------------------------------------------------------------------
# Numpy SSM (fallback when PyTorch unavailable)
# ---------------------------------------------------------------------------

class NumpySSM:
    """Pure-numpy diagonal selective SSM for inference."""

    def __init__(self, input_dim: int, state_dim: int, num_layers: int = 2):
        self.input_dim = input_dim
        self.state_dim = state_dim
        self.num_layers = num_layers

        # Initialize weights with Xavier-like scaling
        scale = lambda d_in, d_out: np.sqrt(2.0 / (d_in + d_out))

        self.layers = []
        for _ in range(num_layers):
            layer = {
                'W_in': np.random.randn(input_dim, state_dim).astype(np.float32) * scale(input_dim, state_dim),
                'B': np.random.randn(state_dim).astype(np.float32) * 0.01,
                'W_out': np.random.randn(state_dim, input_dim).astype(np.float32) * scale(state_dim, input_dim),
                'decay': np.linspace(0.9, 0.999, state_dim).astype(np.float32),
                'dt_proj': np.random.randn(input_dim, state_dim).astype(np.float32) * scale(input_dim, state_dim),
                'dt_bias': np.full(state_dim, -4.0, dtype=np.float32),
                'D': np.random.randn(input_dim).astype(np.float32) * 0.01,
            }
            self.layers.append(layer)

        self.norm_gain = [np.ones(input_dim, dtype=np.float32) for _ in range(num_layers)]
        self.layer_scales = [0.1 for _ in range(num_layers)]

    def _softplus(self, x: np.ndarray) -> np.ndarray:
        return np.log1p(np.exp(-np.abs(x))) + np.maximum(x, 0)

    def _rms_norm(self, x: np.ndarray, gain: np.ndarray) -> np.ndarray:
        rms = np.sqrt(np.mean(x ** 2, axis=-1, keepdims=True) + 1e-6)
        return x / rms * gain

    def step(self, x: np.ndarray, h_prev: List[np.ndarray]) -> Tuple[np.ndarray, List[np.ndarray]]:
        """Single timestep forward."""
        h = x.copy()
        new_hiddens = []

        for i, layer in enumerate(self.layers):
            h_normed = self._rms_norm(h, self.norm_gain[i])

            # Selective dt
            dt = self._softplus(h_normed @ layer['dt_proj'] + layer['dt_bias'])

            # Discretized A
            A_t = np.exp(-dt * layer['decay'])  # [state_dim]

            # Input projection
            Bx = h_normed @ layer['W_in'] + layer['B']
            Bx = Bx * dt

            # Recurrence
            if h_prev is not None and i < len(h_prev):
                h_state = A_t * h_prev[i] + Bx
            else:
                h_state = Bx

            # Output
            y = h_state @ layer['W_out']
            y = y + layer['D'] * h

            # Residual
            h = h + y * self.layer_scales[i]
            new_hiddens.append(h_state)

        return h, new_hiddens

    def forward_sequence(self, xs: np.ndarray) -> np.ndarray:
        """Forward a full sequence [L, input_dim]."""
        hiddens = [np.zeros(self.state_dim, dtype=np.float32) for _ in range(self.num_layers)]
        outputs = []
        for t in range(xs.shape[0]):
            out, hiddens = self.step(xs[t], hiddens)
            outputs.append(out)
        return np.stack(outputs, axis=0)


# ---------------------------------------------------------------------------
# PyTorch SSM (training path)
# ---------------------------------------------------------------------------

if HAS_TORCH:
    class _SSMLayer(nn.Module):
        def __init__(self, input_dim: int, state_dim: int):
            super().__init__()
            self.state_dim = state_dim
            self.W_in = nn.Linear(input_dim, state_dim)
            self.W_out = nn.Linear(state_dim, input_dim)
            self.decay = nn.Parameter(torch.linspace(0.9, 0.999, state_dim))
            self.dt_proj = nn.Linear(input_dim, state_dim)
            self.dt_bias = nn.Parameter(torch.full((state_dim,), -4.0))
            self.D = nn.Parameter(torch.randn(input_dim) * 0.01)
            self.norm_gain = nn.Parameter(torch.ones(input_dim))

        def forward(self, x: torch.Tensor, h_prev: Optional[torch.Tensor]) -> Tuple[torch.Tensor, torch.Tensor]:
            """
            x: [B, input_dim]
            h_prev: [B, state_dim] or None
            Returns: (output [B, input_dim], h_new [B, state_dim])
            """
            # RMS norm
            rms = torch.sqrt(x.pow(2).mean(dim=-1, keepdim=True) + 1e-6)
            x_norm = x / rms * self.norm_gain

            # Selective dt
            dt = F.softplus(self.dt_proj(x_norm) + self.dt_bias)

            # Discretized A
            A_t = torch.exp(-dt * self.decay.unsqueeze(0))

            # Input to state
            Bx = self.W_in(x_norm) * dt

            # State update
            if h_prev is not None:
                h = A_t * h_prev + Bx
            else:
                h = Bx

            # Output
            y = self.W_out(h) + self.D * x
            return y, h

    class ActivitySSMModel(nn.Module):
        def __init__(self, input_dim: int = FEATURE_DIM, state_dim: int = 64, num_layers: int = 2):
            super().__init__()
            self.input_dim = input_dim
            self.state_dim = state_dim
            self.num_layers = num_layers

            self.layers = nn.ModuleList([_SSMLayer(input_dim, state_dim) for _ in range(num_layers)])
            self.layer_scales = nn.ParameterList([nn.Parameter(torch.tensor(0.1)) for _ in range(num_layers)])

            self.action_head = nn.Linear(input_dim, NUM_ACTION_CLASSES)
            self.confidence_head = nn.Linear(input_dim, 1)

            # Parameter prediction heads (lightweight)
            self.domain_head = nn.Linear(input_dim, 32)  # embed domain
            self.file_ext_head = nn.Linear(input_dim, 16)  # embed file extension
            self.command_verb_head = nn.Linear(input_dim, 16)  # embed command verb

        def forward(self, xs: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, Dict[str, torch.Tensor]]:
            """
            xs: [B, L, input_dim]
            Returns:
                action_logits: [B, L, NUM_ACTION_CLASSES]
                confidence: [B, L, 1]
                params: dict of [B, L, ...] tensors
            """
            B, L, D = xs.shape
            device = xs.device

            h = [None] * self.num_layers
            action_logits = []
            confidences = []
            domains = []
            file_exts = []
            command_verbs = []

            for t in range(L):
                x = xs[:, t, :]
                h_new = []
                for i, (layer, scale) in enumerate(zip(self.layers, self.layer_scales)):
                    y, h_i = layer(x, h[i])
                    x = x + y * scale
                    h_new.append(h_i)
                h = h_new

                action_logits.append(self.action_head(x))
                confidences.append(torch.sigmoid(self.confidence_head(x)))
                domains.append(self.domain_head(x))
                file_exts.append(self.file_ext_head(x))
                command_verbs.append(self.command_verb_head(x))

            return (
                torch.stack(action_logits, dim=1),
                torch.stack(confidences, dim=1),
                {
                    'domain': torch.stack(domains, dim=1),
                    'file_ext': torch.stack(file_exts, dim=1),
                    'command_verb': torch.stack(command_verbs, dim=1),
                }
            )

        def predict_next(self, xs: torch.Tensor) -> Tuple[int, float, Dict[str, Any]]:
            """Predict next action from a sequence [B, L, input_dim]."""
            self.eval()
            with torch.no_grad():
                action_logits, confidence, params = self.forward(xs)
                last_logits = action_logits[:, -1, :]  # [B, NUM_ACTION_CLASSES]
                probs = F.softmax(last_logits, dim=-1)
                pred_class = int(torch.argmax(probs, dim=-1)[0])
                conf = float(confidence[:, -1, 0][0])

                # Extract parameter predictions (simple argmax over embedding)
                param_out = {}
                for key, tensor in params.items():
                    last = tensor[:, -1, :][0]
                    param_out[key] = float(torch.argmax(last).item())

            return pred_class, conf, param_out


# ---------------------------------------------------------------------------
# Data loading from SQLite
# ---------------------------------------------------------------------------

def load_activity_sequences(db_path: str, max_seq_len: int = 50, min_seq_len: int = 5) -> List[Tuple[np.ndarray, np.ndarray]]:
    """
    Load activity sequences from incognide's local SQLite DB.
    Returns list of (input_sequence, target_action) tuples.
    """
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Gather all activity events from all tables
    events = []

    # activity_log
    try:
        for row in cursor.execute(
            "SELECT activity_type, activity_data, timestamp FROM activity_log WHERE timestamp IS NOT NULL ORDER BY timestamp"
        ):
            data = {}
            try:
                data = json.loads(row['activity_data'] or '{}')
            except Exception:
                pass
            events.append({
                'type': row['activity_type'] or 'unknown',
                'timestamp': row['timestamp'],
                'data': data,
            })
    except Exception:
        pass

    # browser_history
    try:
        for row in cursor.execute(
            "SELECT title, url, last_visited as timestamp FROM browser_history WHERE last_visited IS NOT NULL ORDER BY last_visited"
        ):
            events.append({
                'type': 'website_visit',
                'timestamp': row['timestamp'],
                'data': {'url': row['url'], 'title': row['title']},
            })
    except Exception:
        pass

    # command_history
    try:
        for row in cursor.execute(
            "SELECT command, timestamp FROM command_history WHERE timestamp IS NOT NULL ORDER BY timestamp"
        ):
            events.append({
                'type': 'terminal_command',
                'timestamp': row['timestamp'],
                'data': {'command': row['command']},
            })
    except Exception:
        pass

    # jinx_executions
    try:
        for row in cursor.execute(
            "SELECT jinx_name, timestamp FROM jinx_executions WHERE timestamp IS NOT NULL ORDER BY timestamp"
        ):
            events.append({
                'type': 'jinx_execution',
                'timestamp': row['timestamp'],
                'data': {'jinx_name': row['jinx_name']},
            })
    except Exception:
        pass

    conn.close()

    # Sort by timestamp
    events.sort(key=lambda e: e['timestamp'] or '')

    # Build sliding-window sequences
    sequences = []
    for i in range(len(events)):
        if i < min_seq_len:
            continue

        seq_events = events[max(0, i - max_seq_len):i]
        target_event = events[i]

        # Encode sequence
        seq_feats = []
        prev_ts = None
        for e in seq_events:
            feat = encode_activity(e['type'], e['timestamp'], e['data'], prev_ts)
            seq_feats.append(feat)
            prev_ts = e['timestamp']

        # Pad or truncate to max_seq_len
        seq_array = np.stack(seq_feats, axis=0)  # [L, FEATURE_DIM]
        if seq_array.shape[0] < max_seq_len:
            pad = np.zeros((max_seq_len - seq_array.shape[0], FEATURE_DIM), dtype=np.float32)
            seq_array = np.concatenate([pad, seq_array], axis=0)
        else:
            seq_array = seq_array[-max_seq_len:]

        target_type = target_event['type']
        target_idx = TYPE_TO_IDX.get(target_type, NUM_ACTION_CLASSES - 1)

        sequences.append((seq_array, target_idx))

    return sequences


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train_model(db_path: str, model_dir: str, epochs: int = 50, lr: float = 1e-3, batch_size: int = 32) -> Dict[str, Any]:
    """Train the activity prediction SSM on local DB data."""
    if not HAS_TORCH:
        return {'error': 'PyTorch not available. Cannot train model.'}

    sequences = load_activity_sequences(db_path)
    if len(sequences) < 10:
        return {'error': f'Not enough activity data. Need >= 10 sequences, got {len(sequences)}.'}

    os.makedirs(model_dir, exist_ok=True)

    # Split train/val
    np.random.shuffle(sequences)
    split = int(0.8 * len(sequences))
    train_data = sequences[:split]
    val_data = sequences[split:]

    model = ActivitySSMModel(input_dim=FEATURE_DIM, state_dim=64, num_layers=2)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.CrossEntropyLoss()

    device = torch.device('cpu')
    model.to(device)

    best_val_acc = 0.0
    history = []

    for epoch in range(epochs):
        # Training
        model.train()
        np.random.shuffle(train_data)
        total_loss = 0.0
        correct = 0
        total = 0

        for i in range(0, len(train_data), batch_size):
            batch = train_data[i:i + batch_size]
            xs = torch.tensor(np.stack([b[0] for b in batch]), dtype=torch.float32, device=device)
            ys = torch.tensor([b[1] for b in batch], dtype=torch.long, device=device)

            optimizer.zero_grad()
            action_logits, _, _ = model(xs)
            loss = criterion(action_logits[:, -1, :], ys)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_loss += float(loss.item()) * xs.size(0)
            preds = torch.argmax(action_logits[:, -1, :], dim=-1)
            correct += int((preds == ys).sum().item())
            total += xs.size(0)

        train_acc = correct / total if total > 0 else 0
        avg_loss = total_loss / total if total > 0 else 0

        # Validation
        model.eval()
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for i in range(0, len(val_data), batch_size):
                batch = val_data[i:i + batch_size]
                xs = torch.tensor(np.stack([b[0] for b in batch]), dtype=torch.float32, device=device)
                ys = torch.tensor([b[1] for b in batch], dtype=torch.long, device=device)
                action_logits, _, _ = model(xs)
                preds = torch.argmax(action_logits[:, -1, :], dim=-1)
                val_correct += int((preds == ys).sum().item())
                val_total += xs.size(0)

        val_acc = val_correct / val_total if val_total > 0 else 0

        history.append({'epoch': epoch + 1, 'loss': avg_loss, 'train_acc': train_acc, 'val_acc': val_acc})

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), os.path.join(model_dir, 'activity_ssm.pt'))

    # Save config
    config = {
        'feature_dim': FEATURE_DIM,
        'state_dim': 64,
        'num_layers': 2,
        'num_classes': NUM_ACTION_CLASSES,
        'activity_types': ACTIVITY_TYPES,
        'best_val_acc': best_val_acc,
        'trained_at': datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(model_dir, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)

    return {
        'success': True,
        'sequences': len(sequences),
        'train_size': len(train_data),
        'val_size': len(val_data),
        'best_val_acc': best_val_acc,
        'history': history,
    }


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def predict_next_action(db_path: str, model_dir: str) -> Optional[Dict[str, Any]]:
    """Load model and predict the next action from recent activity in DB."""
    if not os.path.exists(model_dir):
        return None

    config_path = os.path.join(model_dir, 'config.json')
    model_path = os.path.join(model_dir, 'activity_ssm.pt')

    if not os.path.exists(config_path) or not os.path.exists(model_path):
        return None

    with open(config_path) as f:
        config = json.load(f)

    # Load recent events
    sequences = load_activity_sequences(db_path, max_seq_len=50, min_seq_len=1)
    if not sequences:
        return None

    # Use the most recent sequence
    recent_seq, _ = sequences[-1]

    if HAS_TORCH:
        model = ActivitySSMModel(
            input_dim=config['feature_dim'],
            state_dim=config['state_dim'],
            num_layers=config['num_layers'],
        )
        model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=True))
        model.eval()

        xs = torch.tensor(recent_seq[np.newaxis, ...], dtype=torch.float32)
        pred_idx, confidence, params = model.predict_next(xs)

        return {
            'predicted_action': ACTIVITY_TYPES[pred_idx],
            'predicted_index': pred_idx,
            'confidence': confidence,
            'params': params,
            'top_3': _get_top_k(xs, model, k=3),
        }
    else:
        # Numpy fallback
        model = NumpySSM(input_dim=FEATURE_DIM, state_dim=64, num_layers=2)
        # Note: without saved weights, this won't be accurate; just return heuristic
        return _heuristic_predict(sequences)


def _get_top_k(xs: torch.Tensor, model: 'ActivitySSMModel', k: int = 3) -> List[Dict[str, Any]]:
    with torch.no_grad():
        action_logits, confidence, _ = model(xs)
        probs = F.softmax(action_logits[:, -1, :], dim=-1)[0]
        top_probs, top_indices = torch.topk(probs, k)
        return [
            {'action': ACTIVITY_TYPES[int(idx)], 'probability': float(prob)}
            for idx, prob in zip(top_indices, top_probs)
        ]


def _heuristic_predict(sequences: List[Tuple[np.ndarray, int]]) -> Dict[str, Any]:
    """Rule-based fallback when no trained model exists."""
    recent = sequences[-1][0]
    # Count action types in recent history
    counts = {}
    for i in range(recent.shape[0]):
        action_vec = recent[i, :NUM_ACTION_CLASSES]
        idx = int(np.argmax(action_vec))
        if idx < NUM_ACTION_CLASSES:
            counts[idx] = counts.get(idx, 0) + 1

    if counts:
        pred_idx = max(counts, key=counts.get)
    else:
        pred_idx = 0

    return {
        'predicted_action': ACTIVITY_TYPES[pred_idx],
        'predicted_index': pred_idx,
        'confidence': 0.3,
        'params': {},
        'top_3': [{'action': ACTIVITY_TYPES[pred_idx], 'probability': 0.3}],
        'heuristic': True,
    }


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Activity Intelligence Model')
    parser.add_argument('--db-path', required=True, help='Path to incognide SQLite DB')
    parser.add_argument('--model-dir', default=os.path.expanduser('~/.incognide/activity_model'), help='Model save/load directory')
    parser.add_argument('command', choices=['train', 'predict'], help='Train model or predict next action')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--lr', type=float, default=1e-3)
    args = parser.parse_args()

    if args.command == 'train':
        result = train_model(args.db_path, args.model_dir, epochs=args.epochs, lr=args.lr)
        print(json.dumps(result, indent=2))
    elif args.command == 'predict':
        result = predict_next_action(args.db_path, args.model_dir)
        print(json.dumps(result, indent=2) if result else json.dumps({'error': 'No model or data available.'}))
