"""
Evaluate next-action prediction on a real Incognide activity_log.csv export.

Reuses the same session-safe methodology as the synthetic experiments.
Does not modify production predictor code.

Views:
  - raw: known qstk action types only (drops agent_action until vocab is unified)
  - cleaned: drop modifier-only key events; collapse near-duplicate pane_focus
  - navigation: drop all keyboard_shortcut events (dominant class) so the model
    must learn pane/click/open/close workflow patterns — the Cursor-Tab-relevant signal
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import pandas as pd

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_SRC = os.path.join(_REPO_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from activity_model.experiments.api import (  # noqa: E402
    ACTION_TO_IDX,
    ACTIVITY_TYPES,
    load_model,
    train_from_sequences,
)
from activity_model.experiments.evaluate import (  # noqa: E402
    baseline_markov1,
    baseline_most_frequent,
    baseline_random,
    metrics_from_logits,
    predict_batch,
    sequences_by_session,
)

MODIFIER_KEYS = {'control', 'alt', 'shift', 'meta', 'cmd', 'command', 'option', 'win', 'windows'}

# Dominant / low-semantic classes removed for the navigation-focused view.
NAVIGATION_DROP_TYPES = {'keyboard_shortcut'}


def load_events_from_csv(path: str) -> List[Dict[str, Any]]:
    df = pd.read_csv(path)
    required = {'activity_type', 'timestamp'}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f'CSV missing columns: {missing}')

    events: List[Dict[str, Any]] = []
    for row in df.itertuples(index=False):
        raw = getattr(row, 'activity_data', None)
        data: Dict[str, Any] = {}
        if isinstance(raw, str) and raw.strip():
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    data = parsed
            except json.JSONDecodeError:
                data = {'_raw': raw[:200]}
        events.append({
            'type': getattr(row, 'activity_type'),
            'timestamp': getattr(row, 'timestamp'),
            'data': data,
            'session_id': getattr(row, 'session_id', None) or 'unknown',
        })
    events.sort(key=lambda e: (e['timestamp'] or '', e.get('session_id') or ''))
    return events


def filter_known_types(events: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    kept, dropped = [], defaultdict(int)
    for e in events:
        if e['type'] in ACTION_TO_IDX:
            kept.append(e)
        else:
            dropped[str(e['type'])] += 1
    return kept, dict(dropped)


def clean_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Light cleanup: modifier-only keys + consecutive same-pane focus bursts."""
    out: List[Dict[str, Any]] = []
    prev: Optional[Dict[str, Any]] = None
    for e in events:
        t = e['type']
        data = e.get('data') or {}

        if t == 'keyboard_shortcut':
            key = str(data.get('key') or '').lower()
            if key in MODIFIER_KEYS:
                continue

        if (
            prev is not None
            and t == 'pane_focus'
            and prev['type'] == 'pane_focus'
            and prev.get('session_id') == e.get('session_id')
            and (prev.get('data') or {}).get('paneId') == data.get('paneId')
        ):
            # Keep the latest focus on the same pane within a burst.
            out[-1] = e
            prev = e
            continue

        out.append(e)
        prev = e
    return out


def navigation_events(events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Workflow / navigation view: no keyboard_shortcut dominance.

    Keeps pane_focus, click, pane_open/close, text_input, chat, search, etc.
    These micro-interactions are the intended Cursor-Tab signal (e.g. site →
    pane → click sequences), not something to discard as noise.
    """
    filtered = [e for e in events if e['type'] not in NAVIGATION_DROP_TYPES]
    return clean_events(filtered)


def split_sessions_temporal(
    events: List[Dict[str, Any]],
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    min_session_len: int = 10,
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
    by_session: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for e in events:
        by_session[e['session_id']].append(e)

    # Order sessions by first timestamp (temporal holdout).
    session_ids = sorted(
        [sid for sid, evs in by_session.items() if len(evs) >= min_session_len],
        key=lambda sid: by_session[sid][0]['timestamp'] or '',
    )
    n = len(session_ids)
    if n < 6:
        raise ValueError(f'Need >= 6 usable sessions, got {n}')

    n_train = max(int(n * train_ratio), 1)
    n_val = max(int(n * val_ratio), 1)
    if n_train + n_val >= n:
        n_val = max(1, n - n_train - 1)
    n_test = n - n_train - n_val

    split_ids = {
        'train': session_ids[:n_train],
        'val': session_ids[n_train:n_train + n_val],
        'test': session_ids[n_train + n_val:],
    }
    out: Dict[str, List[Dict[str, Any]]] = {}
    for name, sids in split_ids.items():
        bucket: List[Dict[str, Any]] = []
        for sid in sids:
            bucket.extend(sorted(by_session[sid], key=lambda e: e['timestamp'] or ''))
        out[name] = bucket

    meta = {
        'n_sessions_total': len(by_session),
        'n_sessions_used': n,
        'n_train_sessions': n_train,
        'n_val_sessions': n_val,
        'n_test_sessions': n_test,
        'min_session_len': min_session_len,
    }
    return out, meta


def type_histogram(events: List[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    for e in events:
        counts[str(e['type'])] += 1
    return dict(sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))


def _subsample(
    sequences: List[Tuple[np.ndarray, int]],
    max_n: Optional[int],
    seed: int,
) -> List[Tuple[np.ndarray, int]]:
    if max_n is None or len(sequences) <= max_n:
        return sequences
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(sequences), size=max_n, replace=False)
    idx.sort()
    return [sequences[int(i)] for i in idx]


def run_view(
    name: str,
    events: List[Dict[str, Any]],
    out_root: str,
    seed: int,
    sequence_length: int,
    min_seq_len: int,
    epochs: int,
    lr: float,
    batch_size: int,
    model_config: Dict[str, Any],
    history_lengths: Sequence[int],
    max_train_windows: int,
    max_val_windows: int,
) -> Dict[str, Any]:
    splits, split_meta = split_sessions_temporal(events, min_session_len=max(min_seq_len + 1, 10))

    train_seq = _subsample(
        sequences_by_session(splits['train'], sequence_length, min_seq_len),
        max_train_windows,
        seed,
    )
    val_seq = _subsample(
        sequences_by_session(splits['val'], sequence_length, min_seq_len),
        max_val_windows,
        seed + 1,
    )
    test_seq = sequences_by_session(splits['test'], sequence_length, min_seq_len)

    print(
        f'[{name}] events={len(events)}  windows '
        f'train/val/test={len(train_seq)}/{len(val_seq)}/{len(test_seq)}  '
        f"sessions={split_meta}"
    )
    if len(train_seq) < 50 or len(test_seq) < 20:
        raise RuntimeError(f'[{name}] too few windows for a meaningful eval')

    model_dir = os.path.join(out_root, 'models', name)
    npz = os.path.join(model_dir, 'model.npz')
    if os.path.exists(npz):
        os.remove(npz)

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

    y_train = np.array([y for _, y in train_seq])
    n_classes = len(ACTIVITY_TYPES)
    baselines = {
        'random': baseline_random(y_true, n_classes, seed=seed + 1),
        'most_frequent': baseline_most_frequent(y_train, y_true, n_classes),
        'markov1': baseline_markov1(train_seq, test_seq, n_classes),
    }

    # Small history ablation on the same fixed targets.
    max_l = max(history_lengths) if history_lengths else 0
    hist_rows = []
    if max_l > 0:
        fixed_min = max(min_seq_len, max_l)
        for L in history_lengths:
            tr = _subsample(
                sequences_by_session(splits['train'], L, fixed_min),
                max_train_windows,
                seed + L,
            )
            va = _subsample(
                sequences_by_session(splits['val'], L, fixed_min),
                max_val_windows,
                seed + L + 1,
            )
            te = sequences_by_session(splits['test'], L, fixed_min)
            if len(tr) < 50 or len(te) < 20:
                hist_rows.append({
                    'history_length': L,
                    'skipped': True,
                    'reason': f'too few windows train={len(tr)} test={len(te)}',
                })
                continue
            h_dir = os.path.join(out_root, 'models', f'{name}_L{L}')
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
            h_markov = baseline_markov1(tr, te, n_classes)
            hist_rows.append({
                'history_length': L,
                'skipped': False,
                'ssm_top1': h_metrics['top1_accuracy'],
                'ssm_top3': h_metrics['top3_accuracy'],
                'ssm_macro_f1': h_metrics['macro_f1'],
                'markov1_top1': h_markov['top1_accuracy'],
                'improvement_vs_markov1': h_metrics['top1_accuracy'] - h_markov['top1_accuracy'],
                'n_test': h_metrics['n'],
                'best_val_acc': h_info.get('best_val_acc'),
            })
            print(
                f'[{name} L={L}] SSM={h_metrics["top1_accuracy"]:.4f} '
                f'Markov1={h_markov["top1_accuracy"]:.4f}'
            )

    result = {
        'view': name,
        'n_events': len(events),
        'type_histogram': type_histogram(events),
        'split_meta': split_meta,
        'sequence_length': sequence_length,
        'min_seq_len': min_seq_len,
        'max_train_windows': max_train_windows,
        'max_val_windows': max_val_windows,
        'window_counts': {
            'train': len(train_seq),
            'val': len(val_seq),
            'test': len(test_seq),
        },
        'train_info': {k: v for k, v in train_info.items() if k != 'history'},
        'model': model_metrics,
        'baselines': baselines,
        'history_ablation': hist_rows,
        'action_vocabulary': ACTIVITY_TYPES,
    }
    print(
        f"[{name}] SSM top1={model_metrics['top1_accuracy']:.4f}  "
        f"markov1={baselines['markov1']['top1_accuracy']:.4f}  "
        f"most_freq={baselines['most_frequent']['top1_accuracy']:.4f}  "
        f"macro_f1={model_metrics['macro_f1']:.4f}"
    )
    return result


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Evaluate activity SSM on real activity_log.csv')
    parser.add_argument('--csv', type=str, default=os.path.join(_REPO_ROOT, 'activity_log.csv'))
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--sequence-length', type=int, default=20)
    parser.add_argument('--min-seq-len', type=int, default=5)
    parser.add_argument('--epochs', type=int, default=12)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--model-dim', type=int, default=32)
    parser.add_argument('--state-dim', type=int, default=64)
    parser.add_argument('--num-layers', type=int, default=1)
    parser.add_argument('--history-lengths', type=str, default='1,5,20')
    parser.add_argument('--max-train-windows', type=int, default=4000,
                        help='Cap training windows for runtime (test set kept full)')
    parser.add_argument('--max-val-windows', type=int, default=1000)
    parser.add_argument(
        '--views',
        type=str,
        default='raw,cleaned,navigation',
        help='Comma-separated: raw, cleaned, navigation',
    )
    parser.add_argument(
        '--merge-summary',
        action='store_true',
        help='Merge into existing real_csv_summary.json instead of overwriting other views',
    )
    parser.add_argument(
        '--out-root',
        type=str,
        default=os.path.join(_REPO_ROOT, 'experiments', 'activity_next_action', 'real_csv'),
    )
    args = parser.parse_args(argv)

    history_lengths = [int(x) for x in args.history_lengths.split(',') if x.strip()]
    requested = [v.strip() for v in args.views.split(',') if v.strip()]
    model_config = {
        'feature_dim': 25,
        'model_dim': args.model_dim,
        'state_dim': args.state_dim,
        'num_layers': args.num_layers,
        'num_classes': len(ACTIVITY_TYPES),
    }

    raw_events = load_events_from_csv(args.csv)
    known_events, dropped = filter_known_types(raw_events)
    cleaned = clean_events(known_events)
    navigation = navigation_events(known_events)

    view_data = {
        'raw': known_events,
        'cleaned': cleaned,
        'navigation': navigation,
    }
    unknown = [v for v in requested if v not in view_data]
    if unknown:
        raise SystemExit(f'Unknown views: {unknown}. Choose from {list(view_data)}')

    os.makedirs(os.path.join(args.out_root, 'results'), exist_ok=True)
    out_path = os.path.join(args.out_root, 'results', 'real_csv_summary.json')

    summary: Dict[str, Any] = {
        'csv': os.path.abspath(args.csv),
        'seed': args.seed,
        'n_rows_csv': len(raw_events),
        'dropped_unknown_types': dropped,
        'n_known': len(known_events),
        'n_cleaned': len(cleaned),
        'n_navigation': len(navigation),
        'max_train_windows': args.max_train_windows,
        'max_val_windows': args.max_val_windows,
        'notes': {
            'unknown_types': (
                'agent_action is present in the export / v0.2.30 ActivityTracker but not yet '
                'in qstk ACTIVITY_TYPES; dropped for this run rather than remapped.'
            ),
            'cleaned': (
                'Removes modifier-only keyboard_shortcut events and collapses consecutive '
                'pane_focus bursts on the same paneId.'
            ),
            'navigation': (
                'Drops all keyboard_shortcut events, then applies cleaned focus-burst collapse. '
                'Retains pane_focus/click/pane_open/close/text_input/chat/search — the intended '
                'Cursor-Tab workflow signal (navigation sequences), not discarded as noise.'
            ),
            'split': 'Temporal session holdout (sessions ordered by first timestamp).',
            'subsampling': (
                'Train/val windows capped for runtime; test windows are not subsampled. '
                'Session membership of the holdout is unchanged.'
            ),
        },
        'views': {},
    }
    if args.merge_summary and os.path.exists(out_path):
        with open(out_path, 'r', encoding='utf-8') as f:
            prior = json.load(f)
        summary['views'] = prior.get('views', {})
        summary['notes'] = {**prior.get('notes', {}), **summary['notes']}

    for view_name in requested:
        summary['views'][view_name] = run_view(
            name=view_name,
            events=view_data[view_name],
            out_root=args.out_root,
            seed=args.seed,
            sequence_length=args.sequence_length,
            min_seq_len=args.min_seq_len,
            epochs=args.epochs,
            lr=args.lr,
            batch_size=args.batch_size,
            model_config=model_config,
            history_lengths=history_lengths,
            max_train_windows=args.max_train_windows,
            max_val_windows=args.max_val_windows,
        )

    summary['n_cleaned'] = len(cleaned)
    summary['n_navigation'] = len(navigation)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(json.dumps({'summary_path': out_path, 'views_run': requested}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
