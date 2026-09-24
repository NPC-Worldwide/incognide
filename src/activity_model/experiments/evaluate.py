"""
Evaluate next-action prediction under synthetic activity processes.

Metrics: top-1 accuracy, top-3 accuracy, macro F1, confusion matrix.
Baselines: random, most-frequent, empirical Markov-1.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, 'src'))

from activity_model.experiments.api import (  # noqa: E402
    ACTION_TO_IDX,
    ACTIVITY_TYPES,
    events_to_sequences,
    forward,
    load_model,
    train_from_sequences,
)

from activity_model.experiments.generate_synthetic import generate_dataset, save_dataset  # noqa: E402


def _load_events_jsonl(path: str) -> List[Dict[str, Any]]:
    events = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    return events


def sequences_by_session(
    events: List[Dict[str, Any]],
    max_seq_len: int,
    min_seq_len: int,
) -> List[Tuple[np.ndarray, int]]:
    """Build windows within each session separately (no cross-session leakage)."""
    by_session: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in events:
        by_session[e.get('session_id') or 'default'].append(e)

    sequences: List[Tuple[np.ndarray, int]] = []
    for sid in sorted(by_session.keys()):
        sess = sorted(by_session[sid], key=lambda x: x['timestamp'])
        sequences.extend(events_to_sequences(sess, max_seq_len=max_seq_len, min_seq_len=min_seq_len))
    return sequences


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / (np.sum(e) + 1e-12)


def predict_batch(model: Dict[str, Any], sequences: List[Tuple[np.ndarray, int]], batch_size: int = 32):
    logits_all = []
    y_true = []
    for i in range(0, len(sequences), batch_size):
        batch = sequences[i:i + batch_size]
        xs = np.stack([b[0] for b in batch])
        ys = np.array([b[1] for b in batch])
        out = forward(model, xs)
        logits_all.append(out['action_logits'])
        y_true.append(ys)
    return np.concatenate(logits_all, axis=0), np.concatenate(y_true, axis=0)


def metrics_from_logits(logits: np.ndarray, y_true: np.ndarray, k: int = 3) -> Dict[str, Any]:
    n_classes = logits.shape[1]
    preds = np.argmax(logits, axis=1)
    topk = np.argsort(logits, axis=1)[:, -k:]
    top1 = float(np.mean(preds == y_true))
    topk_acc = float(np.mean([y_true[i] in topk[i] for i in range(len(y_true))]))

    # Macro precision / recall / F1
    f1s = []
    precisions = []
    recalls = []
    cm = np.zeros((n_classes, n_classes), dtype=np.int64)
    for t, p in zip(y_true, preds):
        cm[t, p] += 1
    for c in range(n_classes):
        tp = cm[c, c]
        fp = cm[:, c].sum() - tp
        fn = cm[c, :].sum() - tp
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
        precisions.append(float(prec))
        recalls.append(float(rec))
        f1s.append(float(f1))

    # Prefer ACTIVITY_TYPES names when sizes match; otherwise use class indices.
    if n_classes == len(ACTIVITY_TYPES):
        per_class = {ACTIVITY_TYPES[i]: f1s[i] for i in range(n_classes)}
    else:
        per_class = {str(i): f1s[i] for i in range(n_classes)}

    return {
        'n': int(len(y_true)),
        'top1_accuracy': top1,
        f'top{k}_accuracy': topk_acc,
        'macro_precision': float(np.mean(precisions)),
        'macro_recall': float(np.mean(recalls)),
        'macro_f1': float(np.mean(f1s)),
        'confusion_matrix': cm.tolist(),
        'per_class_f1': per_class,
    }


def baseline_random(y_true: np.ndarray, n_classes: int, seed: int) -> Dict[str, Any]:
    rng = np.random.default_rng(seed)
    logits = rng.random((len(y_true), n_classes))
    return metrics_from_logits(logits, y_true)


def baseline_most_frequent(y_train: np.ndarray, y_true: np.ndarray, n_classes: int) -> Dict[str, Any]:
    counts = np.bincount(y_train, minlength=n_classes).astype(np.float64)
    logits = np.tile(counts, (len(y_true), 1))
    return metrics_from_logits(logits, y_true)


def _action_idx_from_features(feat_row: np.ndarray) -> int:
    # First len(ACTION_TO_IDX) dims are one-hot of the event type.
    n = len(ACTION_TO_IDX)
    return int(np.argmax(feat_row[:n]))


def baseline_markov1(
    train_seq: List[Tuple[np.ndarray, int]],
    test_seq: List[Tuple[np.ndarray, int]],
    n_classes: int,
) -> Dict[str, Any]:
    """P(next | last observed action) from training windows."""
    trans = np.ones((n_classes, n_classes), dtype=np.float64)  # Laplace smoothing
    for xs, y in train_seq:
        # last non-padding step: find last one-hot with any mass
        last_idx = None
        for t in range(xs.shape[0] - 1, -1, -1):
            if xs[t, :n_classes].sum() > 0.5:
                last_idx = _action_idx_from_features(xs[t])
                break
        if last_idx is None:
            continue
        trans[last_idx, y] += 1.0
    trans = trans / trans.sum(axis=1, keepdims=True)

    logits = []
    y_true = []
    for xs, y in test_seq:
        last_idx = 0
        for t in range(xs.shape[0] - 1, -1, -1):
            if xs[t, :n_classes].sum() > 0.5:
                last_idx = _action_idx_from_features(xs[t])
                break
        logits.append(np.log(trans[last_idx] + 1e-12))
        y_true.append(y)
    return metrics_from_logits(np.stack(logits), np.array(y_true))


def run_condition(
    distribution: str,
    out_root: str,
    seed: int,
    sessions: int,
    session_length: int,
    sequence_length: int,
    epochs: int,
    lr: float,
    batch_size: int,
    model_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    data_dir = os.path.join(out_root, 'data', distribution)
    model_dir = os.path.join(out_root, 'models', distribution)
    results_dir = os.path.join(out_root, 'results')
    os.makedirs(results_dir, exist_ok=True)

    dataset = generate_dataset(
        distribution=distribution,
        n_sessions=sessions,
        session_length=session_length,
        seed=seed,
    )
    save_dataset(dataset, data_dir)

    train_seq = sequences_by_session(dataset['events']['train'], sequence_length, min_seq_len=5)
    val_seq = sequences_by_session(dataset['events']['val'], sequence_length, min_seq_len=5)
    test_seq = sequences_by_session(dataset['events']['test'], sequence_length, min_seq_len=5)

    print(f'[{distribution}] windows train/val/test = {len(train_seq)}/{len(val_seq)}/{len(test_seq)}')

    # Fresh model dir per run
    if os.path.exists(os.path.join(model_dir, 'model.npz')):
        os.remove(os.path.join(model_dir, 'model.npz'))

    train_info = train_from_sequences(
        train_data=train_seq,
        val_data=val_seq,
        model_dir=model_dir,
        epochs=epochs,
        lr=lr,
        batch_size=batch_size,
        model_config=model_config,
        seed=seed,
    )
    if 'error' in train_info:
        raise RuntimeError(train_info['error'])

    model = load_model(os.path.join(model_dir, 'model.npz'))
    logits, y_true = predict_batch(model, test_seq, batch_size=batch_size)
    model_metrics = metrics_from_logits(logits, y_true)

    y_train = np.array([y for _, y in train_seq])
    n_classes = len(ACTIVITY_TYPES)
    baselines = {
        'random': baseline_random(y_true, n_classes, seed=seed + 1),
        'most_frequent': baseline_most_frequent(y_train, y_true, n_classes),
        'markov1': baseline_markov1(train_seq, test_seq, n_classes),
    }

    result = {
        'distribution': distribution,
        'seed': seed,
        'sessions': sessions,
        'session_length': session_length,
        'sequence_length': sequence_length,
        'epochs': epochs,
        'train_info': {k: v for k, v in train_info.items() if k != 'history'},
        'history': train_info.get('history'),
        'model': model_metrics,
        'baselines': baselines,
        'window_counts': {
            'train': len(train_seq),
            'val': len(val_seq),
            'test': len(test_seq),
        },
        'action_vocabulary': ACTIVITY_TYPES,
    }

    out_path = os.path.join(results_dir, f'{distribution}.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)
    print(f'[{distribution}] wrote {out_path}')
    print(
        f"[{distribution}] model top1={model_metrics['top1_accuracy']:.3f}  "
        f"markov1={baselines['markov1']['top1_accuracy']:.3f}  "
        f"most_freq={baselines['most_frequent']['top1_accuracy']:.3f}  "
        f"random={baselines['random']['top1_accuracy']:.3f}"
    )
    return result


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Train/evaluate next-action model on synthetic data')
    parser.add_argument('--distribution', choices=['poisson', 'uniform', 'gaussian', 'all'], default='all')
    parser.add_argument('--sessions', type=int, default=80)
    parser.add_argument('--session-length', type=int, default=40)
    parser.add_argument('--sequence-length', type=int, default=20)
    parser.add_argument('--epochs', type=int, default=12)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument(
        '--out-root',
        type=str,
        default=os.path.join(_REPO_ROOT, 'experiments', 'activity_next_action'),
    )
    parser.add_argument('--model-dim', type=int, default=32)
    parser.add_argument('--state-dim', type=int, default=64)
    parser.add_argument('--num-layers', type=int, default=1)
    args = parser.parse_args(argv)

    model_config = {
        'feature_dim': 25,
        'model_dim': args.model_dim,
        'state_dim': args.state_dim,
        'num_layers': args.num_layers,
        'num_classes': len(ACTIVITY_TYPES),
    }

    dists = ['poisson', 'uniform', 'gaussian'] if args.distribution == 'all' else [args.distribution]
    summary = []
    for d in dists:
        r = run_condition(
            distribution=d,
            out_root=args.out_root,
            seed=args.seed,
            sessions=args.sessions,
            session_length=args.session_length,
            sequence_length=args.sequence_length,
            epochs=args.epochs,
            lr=args.lr,
            batch_size=args.batch_size,
            model_config=model_config,
        )
        summary.append({
            'distribution': d,
            'model_top1': r['model']['top1_accuracy'],
            'model_top3': r['model']['top3_accuracy'],
            'model_macro_f1': r['model']['macro_f1'],
            'markov1_top1': r['baselines']['markov1']['top1_accuracy'],
            'most_frequent_top1': r['baselines']['most_frequent']['top1_accuracy'],
            'random_top1': r['baselines']['random']['top1_accuracy'],
        })

    summary_path = os.path.join(args.out_root, 'results', 'summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump({'seed': args.seed, 'conditions': summary}, f, indent=2)
    print(json.dumps({'summary': summary, 'summary_path': summary_path}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
