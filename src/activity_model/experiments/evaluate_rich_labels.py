"""
Rich next-action labels on real navigation activity.

Predicts structured labels instead of coarse types only, e.g.:
  pane_focus:terminal
  pane_open:browser
  click:New Agent
  click:OTHER

Intended Cursor-Tab signal: propose the next UI step (which pane / which control),
not merely 'click' or 'pane_focus'.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_SRC = os.path.join(_REPO_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from activity_model.experiments.api import (  # noqa: E402
    forward,
    load_model,
    make_predictor,
    train_from_sequences,
)
from activity_model.experiments.evaluate import (  # noqa: E402
    baseline_markov1,
    baseline_most_frequent,
    baseline_random,
    metrics_from_logits,
    predict_batch,
)
from activity_model.experiments.evaluate_real_csv import (  # noqa: E402
    filter_known_types,
    load_events_from_csv,
    navigation_events,
    split_sessions_temporal,
    type_histogram,
)

HOURS_PER_DAY = 24
DAYS_PER_WEEK = 7


def _normalize_click_label(label: str, max_len: int = 48) -> str:
    s = ' '.join(str(label or '').split())
    if not s:
        return '(empty)'
    if len(s) > max_len:
        s = s[: max_len - 3] + '...'
    return s


def _pane_type(data: Dict[str, Any]) -> str:
    raw = data.get('paneType') or data.get('pane') or data.get('contentType') or 'unknown'
    return str(raw).strip().lower() or 'unknown'


def event_rich_label_raw(event: Dict[str, Any]) -> str:
    """Unbounded rich label before frequency clustering."""
    t = event['type']
    data = event.get('data') or {}
    if t in ('pane_focus', 'pane_open', 'pane_close'):
        return f'{t}:{_pane_type(data)}'
    if t == 'click':
        return f'click:{_normalize_click_label(data.get("label", ""))}'
    if t == 'text_input':
        ph = str(data.get('placeholder') or '').strip()
        if ph:
            return f'text_input:{_normalize_click_label(ph, 32)}'
        return 'text_input'
    if t == 'chat_message':
        pane = _pane_type(data)
        return f'chat_message:{pane}' if pane != 'unknown' else 'chat_message'
    if t == 'search_query':
        return 'search_query'
    return str(t)


def build_rich_vocab(
    events: List[Dict[str, Any]],
    min_click_count: int = 10,
    min_other_count: int = 5,
) -> Tuple[List[str], Dict[str, str]]:
    """Return (vocab_list, raw_to_clustered) with rare clicks / pane types collapsed."""
    raw_counts = Counter(event_rich_label_raw(e) for e in events)
    mapping: Dict[str, str] = {}
    kept: List[str] = []

    for label, count in sorted(raw_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        if label.startswith('click:'):
            if count >= min_click_count:
                mapping[label] = label
                kept.append(label)
            else:
                mapping[label] = 'click:OTHER'
        elif ':' in label and label.split(':', 1)[0] in (
            'pane_focus', 'pane_open', 'pane_close', 'text_input', 'chat_message'
        ):
            if count >= min_other_count:
                mapping[label] = label
                kept.append(label)
            else:
                prefix = label.split(':', 1)[0]
                mapping[label] = f'{prefix}:OTHER'
        else:
            mapping[label] = label
            kept.append(label)

    # Ensure cluster buckets exist when used.
    for bucket in ('click:OTHER', 'pane_focus:OTHER', 'pane_open:OTHER',
                   'pane_close:OTHER', 'text_input:OTHER', 'chat_message:OTHER'):
        if bucket in mapping.values() and bucket not in kept:
            kept.append(bucket)

    # Stable order: by descending mapped mass, then name.
    mapped_counts: Counter = Counter()
    for raw, c in raw_counts.items():
        mapped_counts[mapping[raw]] += c
    vocab = sorted(set(kept), key=lambda x: (-mapped_counts[x], x))
    return vocab, mapping


def assign_rich_labels(
    events: List[Dict[str, Any]],
    mapping: Dict[str, str],
) -> List[Dict[str, Any]]:
    out = []
    for e in events:
        raw = event_rich_label_raw(e)
        clustered = mapping.get(raw, raw)
        ne = dict(e)
        ne['rich_label'] = clustered
        ne['rich_label_raw'] = raw
        out.append(ne)
    return out


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
        return math.log1p(max((t1 - t0).total_seconds(), 0))
    except Exception:
        return 0.0


def encode_rich_event(
    event: Dict[str, Any],
    label_to_idx: Dict[str, int],
    prev_timestamp: Optional[str],
) -> np.ndarray:
    n = len(label_to_idx)
    onehot = np.zeros(n, dtype=np.float32)
    lab = event.get('rich_label')
    if lab in label_to_idx:
        onehot[label_to_idx[lab]] = 1.0
    data = event.get('data') or {}
    tfeat = _time_features(event['timestamp'])
    delta = np.array([_delta_feature(event['timestamp'], prev_timestamp)], dtype=np.float32)
    ctx = np.array([
        1.0 if data.get('url') else 0.0,
        1.0 if data.get('filePath') or data.get('fileName') else 0.0,
        1.0 if data.get('command') else 0.0,
        1.0 if data.get('query') or data.get('label') else 0.0,
    ], dtype=np.float32)
    return np.concatenate([onehot, tfeat, delta, ctx])


def events_to_rich_sequences(
    events: List[Dict[str, Any]],
    label_to_idx: Dict[str, int],
    max_seq_len: int,
    min_seq_len: int,
    feature_dim: int,
) -> List[Tuple[np.ndarray, int]]:
    sequences: List[Tuple[np.ndarray, int]] = []
    unk = len(label_to_idx) - 1
    for i in range(min_seq_len, len(events)):
        seq_events = events[max(0, i - max_seq_len):i]
        target = events[i].get('rich_label')
        target_idx = label_to_idx.get(target, unk)

        feats = []
        prev_ts = None
        for e in seq_events:
            feats.append(encode_rich_event(e, label_to_idx, prev_ts))
            prev_ts = e['timestamp']
        arr = np.stack(feats, axis=0)
        if arr.shape[0] < max_seq_len:
            pad = np.zeros((max_seq_len - arr.shape[0], feature_dim), dtype=np.float32)
            arr = np.concatenate([pad, arr], axis=0)
        else:
            arr = arr[-max_seq_len:]
        sequences.append((arr, target_idx))
    return sequences


def sequences_by_session_rich(
    events: List[Dict[str, Any]],
    label_to_idx: Dict[str, int],
    max_seq_len: int,
    min_seq_len: int,
    feature_dim: int,
) -> List[Tuple[np.ndarray, int]]:
    by_session: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in events:
        by_session[e.get('session_id') or 'default'].append(e)
    out: List[Tuple[np.ndarray, int]] = []
    for sid in sorted(by_session.keys()):
        sess = sorted(by_session[sid], key=lambda x: x['timestamp'])
        out.extend(events_to_rich_sequences(
            sess, label_to_idx, max_seq_len, min_seq_len, feature_dim
        ))
    return out


def _subsample(sequences, max_n, seed):
    if max_n is None or len(sequences) <= max_n:
        return sequences
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(sequences), size=max_n, replace=False)
    idx.sort()
    return [sequences[int(i)] for i in idx]


def _action_idx_from_features(feat_row: np.ndarray, n_classes: int) -> int:
    return int(np.argmax(feat_row[:n_classes]))


def baseline_markov1_rich(train_seq, test_seq, n_classes: int):
    # Local copy that uses dynamic n_classes (first dims are rich one-hot).
    trans = np.ones((n_classes, n_classes), dtype=np.float64)
    for xs, y in train_seq:
        last_idx = None
        for t in range(xs.shape[0] - 1, -1, -1):
            if xs[t, :n_classes].sum() > 0.5:
                last_idx = _action_idx_from_features(xs[t], n_classes)
                break
        if last_idx is None:
            continue
        trans[last_idx, y] += 1.0
    trans = trans / trans.sum(axis=1, keepdims=True)
    logits, y_true = [], []
    for xs, y in test_seq:
        last_idx = 0
        for t in range(xs.shape[0] - 1, -1, -1):
            if xs[t, :n_classes].sum() > 0.5:
                last_idx = _action_idx_from_features(xs[t], n_classes)
                break
        logits.append(np.log(trans[last_idx] + 1e-12))
        y_true.append(y)
    return metrics_from_logits(np.stack(logits), np.array(y_true))


def top_confused(cm: List[List[int]], vocab: List[str], k: int = 12) -> List[Dict[str, Any]]:
    pairs = []
    n = len(vocab)
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            c = cm[i][j]
            if c > 0:
                pairs.append({'true': vocab[i], 'pred': vocab[j], 'count': int(c)})
    pairs.sort(key=lambda x: -x['count'])
    return pairs[:k]


def run_rich(
    events: List[Dict[str, Any]],
    out_root: str,
    seed: int,
    sequence_length: int,
    min_seq_len: int,
    epochs: int,
    lr: float,
    batch_size: int,
    model_dim: int,
    state_dim: int,
    num_layers: int,
    history_lengths: Sequence[int],
    max_train_windows: int,
    max_val_windows: int,
    min_click_count: int,
) -> Dict[str, Any]:
    vocab, mapping = build_rich_vocab(events, min_click_count=min_click_count)
    labeled = assign_rich_labels(events, mapping)
    label_to_idx = {lab: i for i, lab in enumerate(vocab)}
    n_classes = len(vocab)
    feature_dim = n_classes + 9  # onehot + time4 + delta1 + ctx4

    hist = Counter(e['rich_label'] for e in labeled)
    print(f'[rich] events={len(labeled)} vocab={n_classes} feature_dim={feature_dim}')
    print('[rich] top labels:', hist.most_common(15))

    splits, split_meta = split_sessions_temporal(labeled, min_session_len=max(min_seq_len + 1, 10))

    def make_windows(split_events, L, min_l, max_n, seed_off):
        seqs = sequences_by_session_rich(
            split_events, label_to_idx, L, min_l, feature_dim
        )
        return _subsample(seqs, max_n, seed + seed_off)

    train_seq = make_windows(splits['train'], sequence_length, min_seq_len, max_train_windows, 0)
    val_seq = make_windows(splits['val'], sequence_length, min_seq_len, max_val_windows, 1)
    test_seq = sequences_by_session_rich(
        splits['test'], label_to_idx, sequence_length, min_seq_len, feature_dim
    )
    print(
        f'[rich] windows train/val/test={len(train_seq)}/{len(val_seq)}/{len(test_seq)} '
        f'sessions={split_meta}'
    )

    model_config = {
        'feature_dim': feature_dim,
        'model_dim': model_dim,
        'state_dim': state_dim,
        'num_layers': num_layers,
        'num_classes': n_classes,
    }
    model_dir = os.path.join(out_root, 'models', 'rich_navigation')
    npz = os.path.join(model_dir, 'model.npz')
    if os.path.exists(npz):
        os.remove(npz)

    # Ensure fresh model (train_from_sequences loads existing npz if present).
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

    model = load_model(npz)
    logits, y_true = predict_batch(model, test_seq, batch_size=batch_size)
    model_metrics = metrics_from_logits(logits, y_true)
    cm = np.array(model_metrics['confusion_matrix'])
    per_f1 = {}
    for c, name in enumerate(vocab):
        tp = float(cm[c, c])
        fp = float(cm[:, c].sum() - tp)
        fn = float(cm[c, :].sum() - tp)
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) else 0.0
        per_f1[name] = float(f1)
    model_metrics['per_class_f1'] = per_f1

    y_train = np.array([y for _, y in train_seq])
    baselines = {
        'random': baseline_random(y_true, n_classes, seed=seed + 1),
        'most_frequent': baseline_most_frequent(y_train, y_true, n_classes),
        'markov1': baseline_markov1_rich(train_seq, test_seq, n_classes),
    }

    hist_rows = []
    max_l = max(history_lengths) if history_lengths else 0
    if max_l > 0:
        fixed_min = max(min_seq_len, max_l)
        for L in history_lengths:
            tr = make_windows(splits['train'], L, fixed_min, max_train_windows, 10 + L)
            va = make_windows(splits['val'], L, fixed_min, max_val_windows, 20 + L)
            te = sequences_by_session_rich(
                splits['test'], label_to_idx, L, fixed_min, feature_dim
            )
            if len(tr) < 50 or len(te) < 20:
                hist_rows.append({'history_length': L, 'skipped': True})
                continue
            h_dir = os.path.join(out_root, 'models', f'rich_navigation_L{L}')
            h_npz = os.path.join(h_dir, 'model.npz')
            if os.path.exists(h_npz):
                os.remove(h_npz)
            h_info = train_from_sequences(
                train_data=tr,
                val_data=va,
                model_dir=h_dir,
                epochs=epochs,
                lr=lr,
                batch_size=batch_size,
                model_config=model_config,
                seed=seed,
            )
            h_model = load_model(h_npz)
            h_logits, h_y = predict_batch(h_model, te, batch_size=batch_size)
            h_metrics = metrics_from_logits(h_logits, h_y)
            h_markov = baseline_markov1_rich(tr, te, n_classes)
            hist_rows.append({
                'history_length': L,
                'skipped': False,
                'ssm_top1': h_metrics['top1_accuracy'],
                'ssm_top3': h_metrics['top3_accuracy'],
                'markov1_top1': h_markov['top1_accuracy'],
                'improvement_vs_markov1': h_metrics['top1_accuracy'] - h_markov['top1_accuracy'],
                'n_test': h_metrics['n'],
                'best_val_acc': h_info.get('best_val_acc'),
            })
            print(
                f'[rich L={L}] SSM={h_metrics["top1_accuracy"]:.4f} '
                f'Markov1={h_markov["top1_accuracy"]:.4f}'
            )

    # Example high-confidence correct predictions for qualitative Cursor-Tab feel
    probs = []
    for row in logits:
        e = np.exp(row - np.max(row))
        p = e / (e.sum() + 1e-12)
        probs.append(p)
    examples = []
    for i, (p, y) in enumerate(zip(probs, y_true)):
        pred = int(np.argmax(p))
        if pred == int(y) and float(p[pred]) >= 0.35:
            top3 = np.argsort(p)[-3:][::-1]
            examples.append({
                'true': vocab[int(y)],
                'pred': vocab[pred],
                'confidence': float(p[pred]),
                'top3': [{'label': vocab[int(j)], 'p': float(p[int(j)])} for j in top3],
            })
        if len(examples) >= 15:
            break

    result = {
        'view': 'rich_navigation',
        'n_events': len(labeled),
        'vocab_size': n_classes,
        'vocab': vocab,
        'label_histogram': dict(hist.most_common()),
        'min_click_count': min_click_count,
        'feature_dim': feature_dim,
        'split_meta': split_meta,
        'window_counts': {
            'train': len(train_seq),
            'val': len(val_seq),
            'test': len(test_seq),
        },
        'train_info': {k: v for k, v in train_info.items() if k != 'history'},
        'model': {
            'top1_accuracy': model_metrics['top1_accuracy'],
            'top3_accuracy': model_metrics['top3_accuracy'],
            'macro_f1': model_metrics['macro_f1'],
            'n': model_metrics['n'],
            'per_class_f1': {k: v for k, v in sorted(per_f1.items(), key=lambda kv: -kv[1]) if v > 0},
            'confusion_top_offdiag': top_confused(model_metrics['confusion_matrix'], vocab),
        },
        'baselines': {
            'random': {k: baselines['random'][k] for k in ('top1_accuracy', 'top3_accuracy', 'macro_f1')},
            'most_frequent': {k: baselines['most_frequent'][k] for k in ('top1_accuracy', 'top3_accuracy', 'macro_f1')},
            'markov1': {k: baselines['markov1'][k] for k in ('top1_accuracy', 'top3_accuracy', 'macro_f1')},
        },
        'history_ablation': hist_rows,
        'example_suggestions': examples,
    }
    print(
        f"[rich] SSM top1={result['model']['top1_accuracy']:.4f}  "
        f"markov1={result['baselines']['markov1']['top1_accuracy']:.4f}  "
        f"most_freq={result['baselines']['most_frequent']['top1_accuracy']:.4f}  "
        f"macro_f1={result['model']['macro_f1']:.4f}"
    )
    return result


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Rich-label next-action eval on real CSV')
    parser.add_argument('--csv', type=str, default=os.path.join(_REPO_ROOT, 'activity_log.csv'))
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--sequence-length', type=int, default=20)
    parser.add_argument('--min-seq-len', type=int, default=5)
    parser.add_argument('--epochs', type=int, default=8)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--model-dim', type=int, default=32)
    parser.add_argument('--state-dim', type=int, default=64)
    parser.add_argument('--num-layers', type=int, default=1)
    parser.add_argument('--history-lengths', type=str, default='1,5,20')
    parser.add_argument('--max-train-windows', type=int, default=4000)
    parser.add_argument('--max-val-windows', type=int, default=1000)
    parser.add_argument('--min-click-count', type=int, default=10)
    parser.add_argument(
        '--out-root',
        type=str,
        default=os.path.join(_REPO_ROOT, 'experiments', 'activity_next_action', 'real_csv'),
    )
    args = parser.parse_args(argv)

    history_lengths = [int(x) for x in args.history_lengths.split(',') if x.strip()]
    raw = load_events_from_csv(args.csv)
    known, dropped = filter_known_types(raw)
    nav = navigation_events(known)

    result = run_rich(
        events=nav,
        out_root=args.out_root,
        seed=args.seed,
        sequence_length=args.sequence_length,
        min_seq_len=args.min_seq_len,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        model_dim=args.model_dim,
        state_dim=args.state_dim,
        num_layers=args.num_layers,
        history_lengths=history_lengths,
        max_train_windows=args.max_train_windows,
        max_val_windows=args.max_val_windows,
        min_click_count=args.min_click_count,
    )

    results_dir = os.path.join(args.out_root, 'results')
    os.makedirs(results_dir, exist_ok=True)
    out_path = os.path.join(results_dir, 'rich_navigation_summary.json')
    payload = {
        'csv': os.path.abspath(args.csv),
        'seed': args.seed,
        'dropped_unknown_types': dropped,
        'n_navigation_events': len(nav),
        'result': result,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, indent=2)
    print(json.dumps({'summary_path': out_path, 'vocab_size': result['vocab_size']}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
