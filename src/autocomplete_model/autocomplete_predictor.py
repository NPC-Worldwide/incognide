"""
Autocomplete Intelligence Model — qstk SSM-based character-level completion.

Functional. No classes. No pickle, no json.

Wraps qstk SSM functional API with:
  - SQLite data loading from incognide local DB (autocomplete_suggestions, autocomplete_training)
  - Character-level language modeling (vocab_size=128 ASCII)
  - Gradient-based training with Adam (exact torch autograd)
  - Continuous / periodic retraining
  - Base weight shifting for continual learning
  - HuggingFace hub download for base models
"""

import json
import math
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# qstk imports — core (pure numpy, always works)
# ---------------------------------------------------------------------------

from qstk.cnn.ssm import (
    _rms_norm,
    _softplus,
    _ssm_layer_forward_sequence,
    parallel_scan,
)
from qstk.cnn.layers import complex_glorot, complex_randn

# ---------------------------------------------------------------------------
# qstk imports — training (requires torch)
# ---------------------------------------------------------------------------

try:
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

# ---------------------------------------------------------------------------
# HuggingFace hub (optional — for downloading base weights)
# ---------------------------------------------------------------------------

try:
    from huggingface_hub import hf_hub_download
    HAS_HF = True
except ImportError:
    HAS_HF = False

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

VOCAB_SIZE = 128  # ASCII 0-127
MAX_SEQ_LEN = 256
NUM_LAYERS = 2
MODEL_DIM = 64
STATE_DIM = 128
DTYPE = np.complex128

DEFAULT_CONFIG = {
    'vocab_size': VOCAB_SIZE,
    'max_seq_len': MAX_SEQ_LEN,
    'num_layers': NUM_LAYERS,
    'model_dim': MODEL_DIM,
    'state_dim': STATE_DIM,
    'dtype': DTYPE,
}

# ---------------------------------------------------------------------------
# Tokenization
# ---------------------------------------------------------------------------


def _encode(text: str) -> List[int]:
    return [min(max(ord(c), 0), VOCAB_SIZE - 1) for c in text]


def _decode(ids: List[int]) -> str:
    return "".join(chr(max(0, min(i, 127))) for i in ids)


# ---------------------------------------------------------------------------
# Model factory
# ---------------------------------------------------------------------------


def make_predictor(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Create a fresh autocomplete predictor (functional dict)."""
    cfg = {**DEFAULT_CONFIG, **(config or {})}
    dim = cfg['model_dim']
    state_dim = cfg['state_dim']
    num_layers = cfg['num_layers']
    vocab_size = cfg['vocab_size']
    dtype = cfg['dtype']

    params = {}

    # Embedding
    params['W_embed'] = complex_glorot(vocab_size, dim, dtype=dtype)

    # Logits head
    params['W_logits'] = complex_glorot(dim, vocab_size, dtype=dtype)

    # Per-layer SSM params
    for i in range(num_layers):
        params[f'layer_{i}_log_A_real'] = np.linspace(np.log(0.95), np.log(0.999), state_dim).astype(np.float64)
        params[f'layer_{i}_log_A_imag'] = np.linspace(0.001, np.pi, state_dim).astype(np.float64)
        params[f'layer_{i}_dt_proj'] = np.random.randn(dim, state_dim).astype(np.float64) * np.sqrt(2.0 / (dim + state_dim))
        params[f'layer_{i}_dt_bias'] = np.full(state_dim, -4.0, dtype=np.float64)
        params[f'layer_{i}_B'] = complex_glorot(dim, state_dim, dtype=dtype)
        params[f'layer_{i}_C'] = complex_glorot(state_dim, dim, dtype=dtype)
        params[f'layer_{i}_D'] = complex_randn(dim, scale=0.01, dtype=dtype)
        params[f'layer_{i}_norm_scale'] = np.ones(dim, dtype=dtype)
        params[f'layer_{i}_scale'] = np.array(0.1, dtype=np.float64)

    params['output_norm_scale'] = np.ones(dim, dtype=dtype)

    return {'config': cfg, 'params': params}


# ---------------------------------------------------------------------------
# Forward
# ---------------------------------------------------------------------------


def _embed(token_ids: np.ndarray, W_embed: np.ndarray) -> np.ndarray:
    """Integer token IDs -> complex embeddings."""
    return W_embed[token_ids]  # [B, L, dim] or [L, dim]


def forward(model: Dict[str, Any], token_ids: np.ndarray) -> Dict[str, np.ndarray]:
    """Forward a batch of token sequences.

    Args:
        model: predictor dict from make_predictor().
        token_ids: Integer token IDs, shape [B, L].

    Returns:
        Dict with 'logits': [B, L, vocab_size].
    """
    cfg = model['config']
    params = model['params']
    dim = cfg['model_dim']
    num_layers = cfg['num_layers']
    dtype = cfg['dtype']

    if token_ids.ndim == 1:
        token_ids = token_ids[None, :]  # [1, L]

    B, L = token_ids.shape

    # Embed
    z = _embed(token_ids, params['W_embed']).astype(dtype)  # [B, L, dim] complex

    # Stacked SSM
    for i in range(num_layers):
        prefix = f'layer_{i}_'
        scale = float(params[f'{prefix}scale'])
        outputs = []
        for b in range(B):
            out_b, _ = _ssm_layer_forward_sequence(params, prefix, z[b], None)
            outputs.append(out_b)
        z = z + np.stack(outputs, axis=0) * scale

    # Output norm
    z = _rms_norm(z, params['output_norm_scale'])

    # Logits at every position
    logits = np.abs(z @ params['W_logits'].T)  # [B, L, vocab_size]

    return {'logits': logits}


# ---------------------------------------------------------------------------
# Prediction
# ---------------------------------------------------------------------------


def predict(model: Dict[str, Any], context: str, max_length: int = 20, temperature: float = 0.8) -> Dict[str, Any]:
    """Generate completion from context string.

    Args:
        model: predictor dict.
        context: Input text so far.
        max_length: Max chars to generate.
        temperature: Sampling temperature (0 = greedy).

    Returns:
        Dict with completion, tokens, confidence.
    """
    cfg = model['config']
    vocab_size = cfg['vocab_size']

    ids = _encode(context)
    if not ids:
        ids = [32]  # space as default start

    generated = []
    confidence_list = []

    for _ in range(max_length):
        seq = np.array(ids + generated, dtype=np.int32)
        if len(seq) > cfg['max_seq_len']:
            seq = seq[-cfg['max_seq_len']:]

        out = forward(model, seq)
        logits = out['logits'][0, -1, :]  # [vocab_size]

        if temperature > 0:
            probs = np.exp(logits / temperature)
            probs /= probs.sum() + 1e-10
            next_id = int(np.random.choice(vocab_size, p=probs))
        else:
            next_id = int(np.argmax(logits))

        # Stop on control chars or repeated nulls
        if next_id < 32 or next_id == 127:
            break

        confidence_list.append(float(np.max(logits)))
        generated.append(next_id)

    completion = _decode(generated)
    return {
        'completion': completion,
        'tokens': generated,
        'confidence': float(np.mean(confidence_list)) if confidence_list else 0.0,
        'context': context,
    }


def predict_top_k(model: Dict[str, Any], context: str, k: int = 3) -> List[Dict[str, Any]]:
    """Generate k diverse completions via sampling."""
    results = []
    seen = set()
    attempts = 0
    while len(results) < k and attempts < k * 3:
        out = predict(model, context, max_length=20, temperature=0.8 + attempts * 0.1)
        completion = out['completion']
        if completion and completion not in seen:
            seen.add(completion)
            results.append(out)
        attempts += 1
    return results


# ---------------------------------------------------------------------------
# Save / Load (npz only, config embedded)
# ---------------------------------------------------------------------------


def save(model: Dict[str, Any], path: str) -> None:
    """Save model to .npz with embedded config scalars."""
    params = model['params']
    out = {}
    for k, v in params.items():
        out[k] = v
    cfg = model['config']
    for k, v in cfg.items():
        if isinstance(v, (np.generic,)):
            out[f'__config_{k}'] = np.array(v)
        elif isinstance(v, np.dtype):
            out[f'__config_{k}'] = np.array(v.name, dtype='U32')
        else:
            out[f'__config_{k}'] = np.array(v)
    np.savez(path, **out)


def load(path: str) -> Dict[str, Any]:
    """Load model from .npz."""
    raw = np.load(path, allow_pickle=False)
    params = {}
    config = {}
    for k, v in raw.items():
        if k.startswith('__config_'):
            key = k[9:]
            if v.dtype.kind in 'U' or v.dtype == np.dtype('U32'):
                config[key] = str(v.item())
            else:
                config[key] = v.item()
        else:
            params[k] = v
    # Restore dtype
    if 'dtype' in config:
        config['dtype'] = np.dtype(config['dtype'])
    merged_cfg = {**DEFAULT_CONFIG, **config}
    return {'config': merged_cfg, 'params': params}


# ---------------------------------------------------------------------------
# Base weight shift (continual learning)
# ---------------------------------------------------------------------------


def shift_base_weights(model: Dict[str, Any], shift_scale: float = 0.01) -> None:
    """Perturb all params with Gaussian noise to break symmetry."""
    params = model['params']
    for k, v in params.items():
        if v.dtype.kind in 'c':
            noise = complex_randn(*v.shape, scale=shift_scale, dtype=v.dtype)
        else:
            noise = np.random.randn(*v.shape).astype(v.dtype) * shift_scale
        params[k] = v + noise


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------


def load_training_sequences(db_path: str, max_seq_len: int = 256) -> List[np.ndarray]:
    """Load accepted autocomplete suggestions/training as integer sequences."""
    sequences = []
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # autocomplete_suggestions: input_context + suggestion (accepted=1)
        cursor.execute(
            "SELECT input_context, suggestion FROM autocomplete_suggestions WHERE accepted = 1"
        )
        for ctx, suggestion in cursor.fetchall():
            text = (ctx or "") + (suggestion or "")
            ids = _encode(text)
            if len(ids) >= 2:
                sequences.append(np.array(ids[:max_seq_len], dtype=np.int32))

        # autocomplete_training: input_text + output_text (accepted=1)
        cursor.execute(
            "SELECT input_text, output_text FROM autocomplete_training WHERE accepted = 1"
        )
        for inp, out in cursor.fetchall():
            text = (inp or "") + (out or "")
            ids = _encode(text)
            if len(ids) >= 2:
                sequences.append(np.array(ids[:max_seq_len], dtype=np.int32))

        conn.close()
    except Exception as e:
        print(f"[autocomplete] DB load error: {e}")

    return sequences


# ---------------------------------------------------------------------------
# HF download
# ---------------------------------------------------------------------------


def download_base_weights(model_dir: str, repo_id: str, filename: str = "model.npz") -> Optional[str]:
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
# Loss helpers
# ---------------------------------------------------------------------------


def _cross_entropy_loss(logits: np.ndarray, targets: np.ndarray) -> float:
    """Stable cross-entropy. logits: [B, L, vocab_size], targets: [B, L]."""
    B, L, V = logits.shape
    flat_logits = logits.reshape(-1, V)
    flat_targets = targets.reshape(-1)
    max_logits = np.max(flat_logits, axis=1, keepdims=True)
    exp_logits = np.exp(flat_logits - max_logits)
    probs = exp_logits / np.sum(exp_logits, axis=1, keepdims=True)
    return float(-np.mean(np.log(probs[np.arange(len(flat_targets)), flat_targets] + 1e-8)))


# ---------------------------------------------------------------------------
# SPSA gradient estimator
# ---------------------------------------------------------------------------


def _spsa_grad(model: Dict[str, Any], token_ids: np.ndarray, targets: np.ndarray, epsilon: float = 1e-3) -> Tuple[float, Dict[str, np.ndarray]]:
    """Simultaneous Perturbation Stochastic Approximation gradient.
    Uses only 2 forward passes regardless of parameter count.
    """
    params = model['params']
    orig = {k: v.copy() for k, v in params.items()}

    delta = {}
    for k, v in orig.items():
        if v.dtype.kind in 'c':
            delta[k] = (np.sign(np.random.randn(*v.shape)) + 1j * np.sign(np.random.randn(*v.shape))).astype(v.dtype)
        else:
            delta[k] = np.sign(np.random.randn(*v.shape)).astype(v.dtype)

    for k in params:
        params[k] = orig[k] + epsilon * delta[k]
    out_plus = forward(model, token_ids)
    loss_plus = _cross_entropy_loss(out_plus['logits'], targets)

    for k in params:
        params[k] = orig[k] - epsilon * delta[k]
    out_minus = forward(model, token_ids)
    loss_minus = _cross_entropy_loss(out_minus['logits'], targets)

    for k in params:
        params[k] = orig[k]

    loss = _cross_entropy_loss(out_plus['logits'], targets)
    ratio = (loss_plus - loss_minus) / (2.0 * epsilon)
    grads = {k: ratio * delta[k] for k in delta}
    return loss, grads


# ---------------------------------------------------------------------------
# Torch autograd (exact gradients)
# ---------------------------------------------------------------------------


def _to_torch(a: np.ndarray) -> 'torch.Tensor':
    if a.dtype.kind == 'c':
        return torch.from_numpy(a.view(np.float64)).view(torch.complex128)
    return torch.from_numpy(a)


def _from_torch(t: 'torch.Tensor') -> np.ndarray:
    if t.dtype == torch.complex128:
        return t.detach().cpu().numpy().view(np.float64).view(np.complex128)
    return t.detach().cpu().numpy()


def forward_torch(model: Dict[str, Any], token_ids: np.ndarray) -> Dict[str, 'torch.Tensor']:
    """Torch forward for autograd."""
    cfg = model['config']
    params = model['params']
    dim = cfg['model_dim']
    num_layers = cfg['num_layers']
    dtype = torch.complex128

    if token_ids.ndim == 1:
        token_ids_t = torch.from_numpy(token_ids[None, :])
    else:
        token_ids_t = torch.from_numpy(token_ids)
    B, L = token_ids_t.shape

    # Embed
    W_embed = _to_torch(params['W_embed'])
    z = W_embed[token_ids_t]  # [B, L, dim] complex

    # Stacked SSM
    for i in range(num_layers):
        prefix = f'layer_{i}_'
        scale = float(params[f'{prefix}scale'])
        outputs = []
        for b in range(B):
            out_b, _ = _torch_ssm_layer_forward(params, prefix, z[b], None)
            outputs.append(out_b)
        z = z + torch.stack(outputs, dim=0) * scale

    # Output norm
    z = _torch_rms_norm(z, params['output_norm_scale'])

    logits = torch.abs(z @ _to_torch(params['W_logits']).T)
    return {'logits': logits}


def _torch_rms_norm(z: 'torch.Tensor', scale: np.ndarray) -> 'torch.Tensor':
    mag = torch.abs(z)
    rms = torch.sqrt(torch.mean(mag ** 2, dim=-1, keepdim=True) + 1e-6)
    phase = z / (mag + 1e-8)
    s = _to_torch(scale)
    return phase * (mag / rms) * torch.abs(s)


def _torch_softplus(x: 'torch.Tensor') -> 'torch.Tensor':
    return torch.log1p(torch.exp(-torch.abs(x))) + torch.maximum(x, torch.zeros_like(x))


def _torch_ssm_layer_forward(params: Dict[str, np.ndarray], prefix: str, x: 'torch.Tensor', h0: Optional['torch.Tensor'] = None) -> Tuple['torch.Tensor', 'torch.Tensor']:
    x_normed = _torch_rms_norm(x, params[f'{prefix}norm_scale'])
    dt = _torch_softplus(x_normed.real @ _to_torch(params[f'{prefix}dt_proj']) + _to_torch(params[f'{prefix}dt_bias']))
    decay = torch.exp(_to_torch(params[f'{prefix}log_A_real']))
    freq = _to_torch(params[f'{prefix}log_A_imag'])
    A_mag = torch.exp(-dt * decay[None, :])
    A_t = A_mag * torch.exp(1j * freq[None, :])
    Bx = x_normed @ _to_torch(params[f'{prefix}B']).T
    Bx = Bx * dt
    if h0 is not None:
        first_Bx = A_t[0] * h0 + Bx[0]
        Bx = torch.cat([first_Bx[None, :], Bx[1:]], dim=0)
    # sequential scan for torch (autograd safe, no in-place)
    h_list = [Bx[0]]
    for t in range(1, Bx.shape[0]):
        h_list.append(A_t[t] * h_list[-1] + Bx[t])
    h = torch.stack(h_list, dim=0)
    y = h @ _to_torch(params[f'{prefix}C']).T
    y = y + _to_torch(params[f'{prefix}D'])[None, :] * x
    return y, h[-1]


def forward_backward(model: Dict[str, Any], token_ids: np.ndarray, targets: np.ndarray) -> Tuple[float, Dict[str, np.ndarray]]:
    """Exact gradients via torch autograd. Returns (loss, grads)."""
    if not HAS_TORCH:
        raise ImportError("torch is required for forward_backward")

    p_torch = {}
    for k, v in model['params'].items():
        p_torch[k] = torch.nn.Parameter(_to_torch(v))

    model['params'] = p_torch
    token_ids_t = torch.from_numpy(token_ids)
    targets_t = torch.from_numpy(targets)

    out = forward_torch(model, token_ids_t)
    logits = out['logits']
    B, L, V = logits.shape
    loss = torch.nn.functional.cross_entropy(
        logits.reshape(-1, V),
        targets_t.reshape(-1),
    )

    loss.backward()
    grads = {k: _from_torch(v.grad) for k, v in p_torch.items()}

    # Restore as numpy
    for k, v in p_torch.items():
        model['params'][k] = v.detach().cpu().numpy()
        if v.grad is not None and v.grad.dtype == torch.complex128:
            model['params'][k] = v.grad.detach().cpu().numpy().view(np.float64).view(np.complex128)
        else:
            model['params'][k] = v.detach().cpu().numpy()

    # Re-fix params after detach
    for k, v in p_torch.items():
        model['params'][k] = _from_torch(v)

    return float(loss.item()), grads


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def train_model(
    db_path: str,
    model_dir: str,
    epochs: int = 50,
    lr: float = 1e-3,
    batch_size: int = 16,
    shift_base: bool = False,
    base_repo_id: Optional[str] = None,
) -> Dict[str, Any]:
    sequences = load_training_sequences(db_path)
    if len(sequences) < 10:
        return {'error': f'Need >= 10 sequences, got {len(sequences)}.'}

    os.makedirs(model_dir, exist_ok=True)
    npz_path = os.path.join(model_dir, 'model.npz')

    # Load or create model
    if os.path.exists(npz_path):
        model = load(npz_path)
    elif base_repo_id and HAS_HF:
        downloaded = download_base_weights(model_dir, base_repo_id)
        if downloaded:
            model = load(downloaded)
        else:
            model = make_predictor()
    else:
        model = make_predictor()

    if shift_base and os.path.exists(npz_path):
        print("Shifting base weights before fine-tuning...")
        shift_base_weights(model, shift_scale=0.01)

    # Choose gradient backend
    grad_fn = forward_backward if HAS_TORCH else _spsa_grad
    backend_name = 'torch' if HAS_TORCH else 'spsa'
    print(f"Using {backend_name} gradient backend.")

    # Manual Adam state
    m = {k: np.zeros_like(v) for k, v in model['params'].items()}
    v2 = {k: np.zeros_like(v) for k, v in model['params'].items()}
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    t_step = 0

    # Split train/val
    rng = np.random.RandomState(42)
    rng.shuffle(sequences)
    split = int(0.85 * len(sequences))
    train_data = sequences[:split]
    val_data = sequences[split:]

    best_val_loss = float('inf')
    history = []

    for epoch in range(epochs):
        rng.shuffle(train_data)
        epoch_losses = []

        for i in range(0, len(train_data), batch_size):
            batch = train_data[i:i + batch_size]
            max_len = max(len(s) for s in batch)
            xs = np.full((len(batch), max_len), 0, dtype=np.int32)
            ys = np.full((len(batch), max_len), 0, dtype=np.int32)
            for j, seq in enumerate(batch):
                L = len(seq)
                xs[j, :L - 1] = seq[:-1]
                ys[j, :L - 1] = seq[1:]

            # Mask valid positions
            mask = (ys != 0) | (xs != 0)
            if not np.any(mask):
                continue

            loss, grads = grad_fn(model, xs, ys)
            epoch_losses.append(loss)

            # Adam update
            t_step += 1
            for k in model['params']:
                g = grads[k]
                m[k] = beta1 * m[k] + (1 - beta1) * g
                v2[k] = beta2 * v2[k] + (1 - beta2) * (g.real ** 2 + g.imag ** 2 + 1e-12) if g.dtype.kind == 'c' else beta2 * v2[k] + (1 - beta2) * (g ** 2)
                m_hat = m[k] / (1 - beta1 ** t_step)
                v_hat = v2[k] / (1 - beta2 ** t_step)
                if g.dtype.kind == 'c':
                    model['params'][k] = model['params'][k] - lr * m_hat / (np.sqrt(v_hat) + eps)
                else:
                    model['params'][k] = model['params'][k] - lr * m_hat / (np.sqrt(v_hat) + eps)

        avg_loss = np.mean(epoch_losses) if epoch_losses else 0.0

        # Validation
        val_losses = []
        for seq in val_data:
            if len(seq) < 2:
                continue
            xs = seq[:-1][None, :]
            ys = seq[1:][None, :]
            out = forward(model, xs)
            val_losses.append(_cross_entropy_loss(out['logits'], ys))
        val_loss = float(np.mean(val_losses)) if val_losses else float('inf')

        history.append({'epoch': epoch + 1, 'loss': float(avg_loss), 'val_loss': float(val_loss)})
        print(f"Epoch {epoch + 1}/{epochs}  loss={avg_loss:.4f}  val_loss={val_loss:.4f}")

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            save(model, npz_path)

    return {
        'success': True,
        'sequences': len(sequences),
        'best_val_loss': float(best_val_loss),
        'history': history,
    }


def incremental_train(
    db_path: str,
    model_dir: str,
    epochs: int = 3,
    lr: float = 5e-4,
    batch_size: int = 16,
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


def predict_completion(db_path: str, model_dir: str, context: str, max_length: int = 20) -> Optional[Dict[str, Any]]:
    npz_path = os.path.join(model_dir, 'model.npz')
    if not os.path.exists(npz_path):
        return None
    model = load(npz_path)
    return predict(model, context, max_length=max_length)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--db-path', required=True)
    parser.add_argument('--model-dir', default=os.path.expanduser('~/.incognide/autocomplete_model'))
    parser.add_argument('--context', default='', help='Input context for predict mode')
    parser.add_argument('--max-length', type=int, default=20)
    parser.add_argument('command', choices=['train', 'predict', 'incremental'])
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--shift-base', action='store_true')
    parser.add_argument('--base-repo-id', default=None)
    parser.add_argument('--top-k', type=int, default=1)
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
        model = load(os.path.join(args.model_dir, 'model.npz'))
        if args.top_k > 1:
            result = predict_top_k(model, args.context, k=args.top_k)
        else:
            result = predict(model, args.context, max_length=args.max_length)

    print(json.dumps(result, default=str))
