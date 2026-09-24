"""
Synthetic Incognide activity sequence generator.

Generates next-action prediction datasets under three transition laws
(Poisson / Uniform / Gaussian), using the real ACTION vocabulary from qstk
(which matches ActivityIntelligence / ActivityTracker).

Design (why not just random timestamps):
  The model predicts categorical next-action labels from prior events.
  Therefore each distribution condition changes the *categorical transition
  process*, not only timestamps. Inter-arrival times are still generated so
  delta/time features remain realistic, but the scientific contrast is in
  how P(a_{t+1} | history) is formed.

  - poisson: competing Poisson processes / rate-modulated CTMC over action
    affinity groups (bursty, realistic IDE-like clusters).
  - uniform: history-independent Uniform over actions (near chance ceiling).
  - gaussian: Gaussian RBF affinity over fixed latent action embeddings.

Splits are by *session* (independent streams) to avoid sliding-window leakage.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

# Allow `python -m` / direct script use from repo root
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, os.path.join(_REPO_ROOT, 'src'))

from activity_model.experiments.api import ACTION_TO_IDX, ACTIVITY_TYPES  # noqa: E402


# Affinity groups used by the Poisson rate process (IDE-like bursts).
ACTION_GROUPS: Dict[str, List[str]] = {
    'editing': ['file_open', 'file_edit', 'keyboard_shortcut', 'text_input'],
    'nav': ['pane_open', 'pane_close', 'pane_focus', 'click', 'app_switch'],
    'web': ['website_visit', 'search_query'],
    'shell': ['terminal_command', 'jinx_execution'],
    'chat': ['chat_message', 'memory_created', 'model_change'],
}

GROUP_OF: Dict[str, str] = {
    action: group for group, actions in ACTION_GROUPS.items() for action in actions
}


def _payload_for(action: str, rng: np.random.Generator) -> Dict[str, Any]:
    if action == 'website_visit':
        host = rng.choice(['github.com', 'docs.python.org', 'stackoverflow.com', 'localhost'])
        return {'url': f'https://{host}/p/{rng.integers(1, 999)}', 'title': f'page-{host}'}
    if action in ('file_open', 'file_edit'):
        name = rng.choice(['app.py', 'main.ts', 'README.md', 'model.py'])
        return {'filePath': f'/workspace/{name}', 'fileName': name}
    if action == 'terminal_command':
        return {'command': rng.choice(['ls', 'git status', 'npm test', 'pytest'])}
    if action == 'jinx_execution':
        return {'jinx_name': rng.choice(['summarize', 'refactor', 'test_gen']), 'command': 'jinx'}
    if action == 'search_query':
        return {'query': rng.choice(['error', 'hook', 'sqlite', 'ssm'])}
    if action == 'chat_message':
        return {'content': 'user message'}
    if action == 'memory_created':
        return {'initial_memory': 'note', 'npc': 'sibiji'}
    if action == 'model_change':
        return {'model': rng.choice(['gpt-4o', 'claude', 'llama3'])}
    if action in ('pane_open', 'pane_close', 'pane_focus'):
        return {'paneType': rng.choice(['editor', 'terminal', 'browser', 'chat'])}
    if action == 'click':
        return {'label': 'ui', 'x': int(rng.integers(0, 800)), 'y': int(rng.integers(0, 600))}
    if action == 'keyboard_shortcut':
        return {'key': rng.choice(['s', 'p', 'Enter']), 'ctrl': True}
    if action == 'text_input':
        return {'value': 'typed', 'placeholder': 'prompt'}
    if action == 'app_switch':
        return {'app': rng.choice(['incognide', 'browser', 'terminal'])}
    return {}


def _interarrival_seconds(rng: np.random.Generator, mean_seconds: float = 25.0) -> float:
    # Positive exponential inter-arrivals (shared across conditions).
    return float(max(rng.exponential(mean_seconds), 0.5))


def _init_poisson_rates(rng: np.random.Generator, n: int) -> np.ndarray:
    # Base rates ~ Gamma so relative intensities vary per session.
    return rng.gamma(shape=1.5, scale=1.0, size=n).astype(np.float64) + 0.05


def _sample_poisson_next(
    prev: Optional[str],
    rates: np.ndarray,
    actions: Sequence[str],
    rng: np.random.Generator,
    boost: float = 3.0,
    decay: float = 0.85,
) -> Tuple[str, np.ndarray]:
    """Competing Poisson: sample next action proportional to current rates,
    then boost the chosen action's group (bursty clusters)."""
    rates = rates * decay + 0.05
    if prev is not None:
        g = GROUP_OF.get(prev)
        if g:
            for a in ACTION_GROUPS[g]:
                rates[ACTION_TO_IDX[a]] += boost
    # Competing exponentials <=> categorical(normalize(rates))
    probs = rates / rates.sum()
    idx = int(rng.choice(len(actions), p=probs))
    return actions[idx], rates


def _build_gaussian_transition(
    actions: Sequence[str],
    rng: np.random.Generator,
    dim: int = 8,
    tau: float = 1.25,
) -> np.ndarray:
    emb = rng.normal(0.0, 1.0, size=(len(actions), dim))
    # Pairwise RBF affinities -> row-stochastic transition matrix.
    diff = emb[:, None, :] - emb[None, :, :]
    dist2 = np.sum(diff ** 2, axis=-1)
    aff = np.exp(-dist2 / (2.0 * tau ** 2))
    aff = aff / aff.sum(axis=1, keepdims=True)
    return aff.astype(np.float64)


def sample_next_action(
    distribution: str,
    prev: Optional[str],
    state: Dict[str, Any],
    actions: Sequence[str],
    rng: np.random.Generator,
) -> str:
    if distribution == 'uniform':
        return str(rng.choice(actions))

    if distribution == 'gaussian':
        if prev is None:
            return str(rng.choice(actions))
        row = state['trans'][ACTION_TO_IDX[prev]]
        return actions[int(rng.choice(len(actions), p=row))]

    if distribution == 'poisson':
        nxt, state['rates'] = _sample_poisson_next(prev, state['rates'], actions, rng)
        return nxt

    raise ValueError(f'Unknown distribution: {distribution}')


def generate_session(
    distribution: str,
    length: int,
    rng: np.random.Generator,
    start_time: datetime,
    session_id: str,
    actions: Sequence[str] = ACTIVITY_TYPES,
) -> List[Dict[str, Any]]:
    state: Dict[str, Any] = {}
    if distribution == 'poisson':
        state['rates'] = _init_poisson_rates(rng, len(actions))
    elif distribution == 'gaussian':
        # Shared transition matrix is injected by caller via state['trans']
        if 'trans' not in state:
            raise KeyError('gaussian state requires trans matrix')

    events: List[Dict[str, Any]] = []
    t = start_time
    prev: Optional[str] = None
    for _ in range(length):
        action = sample_next_action(distribution, prev, state, actions, rng)
        events.append({
            'type': action,
            'timestamp': t.isoformat(),
            'data': _payload_for(action, rng),
            'session_id': session_id,
        })
        prev = action
        t = t + timedelta(seconds=_interarrival_seconds(rng))
    return events


def generate_dataset(
    distribution: str,
    n_sessions: int,
    session_length: int,
    seed: int,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
) -> Dict[str, Any]:
    if distribution not in ('poisson', 'uniform', 'gaussian'):
        raise ValueError(distribution)
    if not (0 < train_ratio < 1) or not (0 < val_ratio < 1) or train_ratio + val_ratio >= 1:
        raise ValueError('train_ratio + val_ratio must be < 1')

    rng = np.random.default_rng(seed)
    actions = list(ACTIVITY_TYPES)

    shared_state: Dict[str, Any] = {}
    if distribution == 'gaussian':
        # One transition law for the whole dataset (fixed embeddings).
        shared_state['trans'] = _build_gaussian_transition(actions, rng)

    n_train = int(n_sessions * train_ratio)
    n_val = int(n_sessions * val_ratio)
    n_test = n_sessions - n_train - n_val
    if min(n_train, n_val, n_test) < 1:
        raise ValueError('Need enough sessions for non-empty train/val/test')

    splits = {
        'train': n_train,
        'val': n_val,
        'test': n_test,
    }

    t0 = datetime(2024, 6, 1, tzinfo=timezone.utc)
    out: Dict[str, List[Dict[str, Any]]] = {k: [] for k in splits}
    meta_sessions = []

    session_counter = 0
    for split_name, count in splits.items():
        for _ in range(count):
            session_counter += 1
            sid = f'{distribution}_{split_name}_{session_counter:04d}'
            # Independent RNG stream per session derived from master seed + id
            session_rng = np.random.default_rng(seed + session_counter * 10007)
            state = dict(shared_state)
            if distribution == 'poisson':
                state['rates'] = _init_poisson_rates(session_rng, len(actions))
            start = t0 + timedelta(days=session_counter)
            # Inline generation with prepared state
            events: List[Dict[str, Any]] = []
            t = start
            prev: Optional[str] = None
            for _step in range(session_length):
                action = sample_next_action(distribution, prev, state, actions, session_rng)
                events.append({
                    'type': action,
                    'timestamp': t.isoformat(),
                    'data': _payload_for(action, session_rng),
                    'session_id': sid,
                })
                prev = action
                t = t + timedelta(seconds=_interarrival_seconds(session_rng))
            out[split_name].extend(events)
            meta_sessions.append({'session_id': sid, 'split': split_name, 'length': session_length})

    return {
        'distribution': distribution,
        'seed': seed,
        'n_sessions': n_sessions,
        'session_length': session_length,
        'actions': actions,
        'splits': {k: len(v) for k, v in out.items()},
        'sessions': meta_sessions,
        'events': out,
        'gaussian_transition': shared_state.get('trans').tolist() if 'trans' in shared_state else None,
    }


def write_sqlite(events: List[Dict[str, Any]], db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path) or '.', exist_ok=True)
    if os.path.exists(db_path):
        os.remove(db_path)
    conn = sqlite3.connect(db_path)
    conn.execute(
        '''CREATE TABLE activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            activity_type TEXT,
            activity_data TEXT,
            directory_path TEXT,
            npc TEXT,
            device_id TEXT,
            session_id TEXT,
            timestamp TEXT
        )'''
    )
    rows = [
        (
            e['type'],
            json.dumps(e.get('data') or {}),
            None,
            None,
            None,
            e.get('session_id'),
            e['timestamp'],
        )
        for e in events
    ]
    conn.executemany(
        'INSERT INTO activity_log (activity_type, activity_data, directory_path, npc, device_id, session_id, timestamp) '
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
        rows,
    )
    conn.commit()
    conn.close()


def save_dataset(dataset: Dict[str, Any], out_dir: str) -> Dict[str, str]:
    os.makedirs(out_dir, exist_ok=True)
    paths = {}
    for split, events in dataset['events'].items():
        db_path = os.path.join(out_dir, f'{split}.db')
        write_sqlite(events, db_path)
        paths[split] = db_path
        # Also keep JSONL for inspection / non-SQLite tooling
        jsonl_path = os.path.join(out_dir, f'{split}.jsonl')
        with open(jsonl_path, 'w', encoding='utf-8') as f:
            for e in events:
                f.write(json.dumps(e) + '\n')
        paths[f'{split}_jsonl'] = jsonl_path

    meta = {k: v for k, v in dataset.items() if k != 'events'}
    meta_path = os.path.join(out_dir, 'meta.json')
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    paths['meta'] = meta_path
    return paths


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='Generate synthetic Incognide activity sequences')
    parser.add_argument('--distribution', choices=['poisson', 'uniform', 'gaussian'], required=True)
    parser.add_argument('--sessions', type=int, default=100, help='Number of independent sessions')
    parser.add_argument('--session-length', type=int, default=50, help='Events per session')
    parser.add_argument('--sequence-length', type=int, default=None,
                        help='Alias: if set without --session-length override semantics, treated as session length')
    parser.add_argument('--samples', type=int, default=None,
                        help='Approximate total events; overrides sessions*session_length when set')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--out-dir', type=str, default=None)
    args = parser.parse_args(argv)

    session_length = args.session_length
    if args.sequence_length is not None:
        session_length = args.sequence_length
    n_sessions = args.sessions
    if args.samples is not None:
        n_sessions = max(args.samples // session_length, 10)

    out_dir = args.out_dir or os.path.join(
        _REPO_ROOT, 'experiments', 'activity_next_action', 'data', args.distribution
    )

    dataset = generate_dataset(
        distribution=args.distribution,
        n_sessions=n_sessions,
        session_length=session_length,
        seed=args.seed,
    )
    paths = save_dataset(dataset, out_dir)
    print(json.dumps({
        'distribution': args.distribution,
        'seed': args.seed,
        'n_sessions': n_sessions,
        'session_length': session_length,
        'splits': dataset['splits'],
        'out_dir': out_dir,
        'paths': paths,
    }, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
