# Activity Next-Action Prediction Experiment

Reproducible synthetic evaluation of Incognide's Activity Intelligence
next-action predictor (`src/activity_model/activity_predictor.py` + `qstk.cnn` SSM).

## What this tests

Given prior events `e_1 … e_t`, predict categorical action `e_{t+1}` from the
real 16-label vocabulary used by Activity Intelligence / ActivityTracker / qstk:

`pane_open`, `pane_close`, `pane_focus`, `file_open`, `file_edit`,
`website_visit`, `terminal_command`, `chat_message`, `app_switch`,
`search_query`, `model_change`, `click`, `keyboard_shortcut`, `text_input`,
`jinx_execution`, `memory_created`.

## Synthetic-data design (important)

Distributions are applied to the **categorical transition process**, not only
to timestamps. Random timestamps alone would not stress next-action prediction.

| Condition | Transition law | Intuition |
|-----------|----------------|-----------|
| **poisson** | Competing Poisson / rate-modulated CTMC with affinity-group boosts | Bursty IDE-like clusters (edit→edit, browse→search) |
| **uniform** | History-independent Uniform over actions | Near-chance ceiling; sanity check |
| **gaussian** | Softmax of Gaussian RBF affinities over fixed latent embeddings | Smooth neighborhood structure in action space |

Inter-arrival times are exponential in all conditions so delta/time features
remain present. Train/val/test splits are by **independent sessions** so
sliding windows cannot leak across splits.

## Install

PyPI `qstkl` currently ships without `qstk.cnn.ssm` (the activity API). Install
qstk from GitHub, plus numpy / torch / huggingface_hub:

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install numpy huggingface_hub torch --index-url https://download.pytorch.org/whl/cpu
pip install --no-deps "git+https://github.com/NPC-Worldwide/qstk.git"
```

(`--no-deps` avoids pulling the full `npcpy` stack; only numpy is required for SSM.)

## Commands

Generate one distribution:

```bash
python src/activity_model/experiments/generate_synthetic.py --distribution poisson --sessions 80 --session-length 40 --seed 42
```

Run full train + eval for all three:

```bash
python src/activity_model/experiments/run_experiment.py --distribution all --sessions 80 --session-length 40 --sequence-length 20 --epochs 12 --seed 42
```

Smoke-test the existing predictor CLI (needs a SQLite activity DB):

```bash
python src/activity_model/activity_predictor.py --db-path path/to/history.db --model-dir experiments/activity_next_action/models/poisson train --epochs 3
python src/activity_model/activity_predictor.py --db-path path/to/history.db --model-dir experiments/activity_next_action/models/poisson predict
```

Artifacts land under `experiments/activity_next_action/` (data/models gitignored).

## History-length ablation

```bash
python src/activity_model/experiments/ablate_history_length.py \
  --distribution all --lengths 1,5,10,20,50 \
  --sessions 80 --session-length 80 --epochs 12 --seed 42
```

See `HISTORY_ABLATION.md` for results. Prediction targets are held fixed (`min_seq_len=max L`) so only history length changes.

## Real activity_log.csv

```bash
python src/activity_model/experiments/evaluate_real_csv.py \
  --csv activity_log.csv --views navigation --merge-summary \
  --epochs 8 --seed 42 --history-lengths 1,5,20 --max-train-windows 4000
```

Views: `raw`, `cleaned`, `navigation` (drops all `keyboard_shortcut` — keeps pane/click workflow signal).

Rich labels (`paneType` + click targets):

```bash
python src/activity_model/experiments/evaluate_rich_labels.py \
  --csv activity_log.csv --epochs 8 --seed 42 --min-click-count 10
```

See `REAL_CSV.md`. Keep exports out of git (gitignored).

## Baselines

- **random**: uniform random scores
- **most_frequent**: always predict the most common training label
- **markov1**: empirical P(next | last action) with Laplace smoothing

## Production vs experiment

| Already in Incognide | Added here |
|----------------------|------------|
| SSM predictor wrapper, daemon predict/train jobs, ActivityIntelligence UI | Synthetic generator, session-safe eval, baselines, this README |
| Action vocab lives in `qstk.cnn.ssm.ACTIVITY_TYPES` (duplicated conceptually in TS) | No attempt to unify the upcoming action-list refactor |

Experiment scripts import train / eval / vocab through
`src/activity_model/experiments/api.py` so action-set migrations
(e.g. `caug/v0.2.30`) can update one wrapper instead of every script.

