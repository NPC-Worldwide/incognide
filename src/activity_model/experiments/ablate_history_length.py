"""
History-length ablation: does the SSM use more than the last action?

For each synthetic distribution, generate the dataset once, then train/eval
the same SSM architecture at history lengths L in {1,5,10,20,50}.

Fairness control: prediction targets are fixed by using min_seq_len = max(L).
Only the amount of preceding context fed to the model changes with L.
Markov-1 is recomputed on the same windows (always uses last observed action).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
_SRC = os.path.join(_REPO_ROOT, 'src')
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)

from activity_model.experiments.api import (  # noqa: E402
    ACTIVITY_TYPES,
    load_model,
    train_from_sequences,
)
from activity_model.experiments.evaluate import (  # noqa: E402
    baseline_markov1,
    metrics_from_logits,
    predict_batch,
    sequences_by_session,
)
from activity_model.experiments.generate_synthetic import (  # noqa: E402
    generate_dataset,
    save_dataset,
)

DEFAULT_LENGTHS = [1, 5, 10, 20, 50]


def _plot_history_curves(
    rows: List[Dict[str, Any]],
    out_path: str,
) -> Optional[str]:
    """Write a simple top-1 vs L plot. Returns path or None if matplotlib missing."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
    except ImportError:
        return None

    fig, ax = plt.subplots(figsize=(8, 5))
    markers = {'poisson': 'o', 'uniform': 's', 'gaussian': '^'}
    for dist in ('poisson', 'uniform', 'gaussian'):
        dist_rows = [r for r in rows if r['distribution'] == dist]
        dist_rows = sorted(dist_rows, key=lambda r: r['history_length'])
        xs = [r['history_length'] for r in dist_rows]
        ys = [r['ssm_top1'] for r in dist_rows]
        ax.plot(xs, ys, marker=markers[dist], label=f'{dist} (SSM)')
        ys_m = [r['markov1_top1'] for r in dist_rows]
        ax.plot(xs, ys_m, linestyle='--', marker=markers[dist], alpha=0.5, label=f'{dist} (Markov-1)')

    ax.axhline(1.0 / len(ACTIVITY_TYPES), color='gray', linestyle=':', linewidth=1, label='chance (1/16)')
    ax.set_xlabel('History length L')
    ax.set_ylabel('Top-1 accuracy')
    ax.set_title('History-length ablation: SSM vs Markov-1')
    ax.set_xticks(sorted({r['history_length'] for r in rows}))
    ax.set_ylim(0.0, max(0.55, max(r['ssm_top1'] for r in rows) + 0.05))
    ax.legend(fontsize=8, ncol=2)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    fig.savefig(out_path, dpi=150)
    plt.close(fig)
    return out_path


def run_ablation(
    distributions: Sequence[str],
    lengths: Sequence[int],
    out_root: str,
    seed: int,
    sessions: int,
    session_length: int,
    epochs: int,
    lr: float,
    batch_size: int,
    model_config: Dict[str, Any],
) -> Dict[str, Any]:
    max_l = max(lengths)
    if session_length <= max_l:
        raise ValueError(
            f'session_length ({session_length}) must be > max history length ({max_l}) '
            'so each session yields shared prediction targets'
        )

    # Fixed start index so every L predicts the same event positions.
    min_seq_len = max_l

    rows: List[Dict[str, Any]] = []
    detailed: Dict[str, Any] = {}

    for distribution in distributions:
        data_dir = os.path.join(out_root, 'data', distribution)
        dataset = generate_dataset(
            distribution=distribution,
            n_sessions=sessions,
            session_length=session_length,
            seed=seed,
        )
        save_dataset(dataset, data_dir)
        detailed[distribution] = {}

        for L in lengths:
            tag = f'{distribution}_L{L}'
            model_dir = os.path.join(out_root, 'models', tag)
            npz = os.path.join(model_dir, 'model.npz')
            if os.path.exists(npz):
                os.remove(npz)

            train_seq = sequences_by_session(
                dataset['events']['train'], max_seq_len=L, min_seq_len=min_seq_len
            )
            val_seq = sequences_by_session(
                dataset['events']['val'], max_seq_len=L, min_seq_len=min_seq_len
            )
            test_seq = sequences_by_session(
                dataset['events']['test'], max_seq_len=L, min_seq_len=min_seq_len
            )

            print(
                f'[{tag}] windows train/val/test='
                f'{len(train_seq)}/{len(val_seq)}/{len(test_seq)} '
                f'(min_seq_len={min_seq_len}, L={L})'
            )

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
                raise RuntimeError(f'{tag}: {train_info["error"]}')

            model = load_model(npz)
            logits, y_true = predict_batch(model, test_seq, batch_size=batch_size)
            model_metrics = metrics_from_logits(logits, y_true)
            markov = baseline_markov1(train_seq, test_seq, n_classes=len(ACTIVITY_TYPES))

            ssm_top1 = float(model_metrics['top1_accuracy'])
            markov_top1 = float(markov['top1_accuracy'])
            improvement = ssm_top1 - markov_top1

            row = {
                'distribution': distribution,
                'history_length': L,
                'ssm_top1': ssm_top1,
                'ssm_top3': float(model_metrics['top3_accuracy']),
                'ssm_macro_f1': float(model_metrics['macro_f1']),
                'markov1_top1': markov_top1,
                'improvement_vs_markov1': improvement,
                'window_counts': {
                    'train': len(train_seq),
                    'val': len(val_seq),
                    'test': len(test_seq),
                },
                'best_val_acc': float(train_info.get('best_val_acc', 0.0)),
            }
            rows.append(row)
            detailed[distribution][f'L{L}'] = {
                **row,
                'model': model_metrics,
                'markov1': markov,
                'train_info': {k: v for k, v in train_info.items() if k != 'history'},
            }
            print(
                f'[{tag}] SSM top1={ssm_top1:.4f}  Markov-1={markov_top1:.4f}  '
                f'delta={improvement:+.4f}'
            )

    # Within-distribution deltas relative to L=1
    deltas_from_l1: Dict[str, List[Dict[str, Any]]] = {}
    for dist in distributions:
        dist_rows = sorted(
            [r for r in rows if r['distribution'] == dist],
            key=lambda r: r['history_length'],
        )
        if not dist_rows:
            continue
        base = dist_rows[0]['ssm_top1']
        deltas_from_l1[dist] = [
            {
                'history_length': r['history_length'],
                'ssm_top1': r['ssm_top1'],
                'delta_vs_L1': r['ssm_top1'] - base,
            }
            for r in dist_rows
        ]

    summary = {
        'seed': seed,
        'sessions': sessions,
        'session_length': session_length,
        'min_seq_len_fixed': min_seq_len,
        'history_lengths': list(lengths),
        'epochs': epochs,
        'model_config': model_config,
        'methodology': (
            'Same generated sessions per distribution; prediction indices fixed at '
            f'i >= {min_seq_len}; only max history L varies. Markov-1 uses last action only.'
        ),
        'rows': rows,
        'delta_vs_L1': deltas_from_l1,
    }

    results_dir = os.path.join(out_root, 'results')
    os.makedirs(results_dir, exist_ok=True)
    summary_path = os.path.join(results_dir, 'history_ablation_summary.json')
    detail_path = os.path.join(results_dir, 'history_ablation_detail.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    with open(detail_path, 'w', encoding='utf-8') as f:
        json.dump(detailed, f, indent=2)

    plot_path = os.path.join(results_dir, 'history_ablation_top1.png')
    written_plot = _plot_history_curves(rows, plot_path)
    summary['summary_path'] = summary_path
    summary['detail_path'] = detail_path
    summary['plot_path'] = written_plot

    print(json.dumps({
        'summary_path': summary_path,
        'plot_path': written_plot,
        'rows': rows,
        'delta_vs_L1': deltas_from_l1,
    }, indent=2))
    return summary


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='History-length ablation for activity SSM')
    parser.add_argument('--distribution', choices=['poisson', 'uniform', 'gaussian', 'all'], default='all')
    parser.add_argument('--lengths', type=str, default='1,5,10,20,50')
    parser.add_argument('--sessions', type=int, default=80)
    parser.add_argument('--session-length', type=int, default=80,
                        help='Must exceed max L so shared targets exist (default 80 for L<=50)')
    parser.add_argument('--epochs', type=int, default=12)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument(
        '--out-root',
        type=str,
        default=os.path.join(_REPO_ROOT, 'experiments', 'activity_next_action', 'history_ablation'),
    )
    parser.add_argument('--model-dim', type=int, default=32)
    parser.add_argument('--state-dim', type=int, default=64)
    parser.add_argument('--num-layers', type=int, default=1)
    args = parser.parse_args(argv)

    lengths = [int(x.strip()) for x in args.lengths.split(',') if x.strip()]
    dists = ['poisson', 'uniform', 'gaussian'] if args.distribution == 'all' else [args.distribution]
    model_config = {
        'feature_dim': 25,
        'model_dim': args.model_dim,
        'state_dim': args.state_dim,
        'num_layers': args.num_layers,
        'num_classes': len(ACTIVITY_TYPES),
    }

    run_ablation(
        distributions=dists,
        lengths=lengths,
        out_root=args.out_root,
        seed=args.seed,
        sessions=args.sessions,
        session_length=args.session_length,
        epochs=args.epochs,
        lr=args.lr,
        batch_size=args.batch_size,
        model_config=model_config,
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
