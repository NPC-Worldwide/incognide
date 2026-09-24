# Real activity_log.csv evaluation

Source: local `activity_log.csv` export (~28.8k rows, 2026-05-23 → 2026-09-02, 582 sessions).

## Product framing

Pane focus, clicks, and pane open/close are **not** discarded as noise for Cursor-Tab.
Most real use is navigating the workspace; sequences like

`click → pane_open → pane_focus → click`

are exactly the patterns a next-action suggester should learn so it can propose the next step automatically.

`keyboard_shortcut` is treated separately: it dominates the raw log (~41% of events) and swamps the label distribution, so the **navigation** view drops it entirely.

## Data shape

| Type | Count |
|------|------:|
| keyboard_shortcut | 11852 |
| pane_focus | 10432 |
| click | 4714 |
| text_input | 991 |
| pane_open | 422 |
| pane_close | 344 |
| chat_message | 21 |
| agent_action | 7 |
| search_query | 3 |

`agent_action` (v0.2.30) is not in qstk `ACTIVITY_TYPES` yet — dropped (7 rows).

## Method

```bash
# All views
python src/activity_model/experiments/evaluate_real_csv.py \
  --csv activity_log.csv --views raw,cleaned,navigation \
  --epochs 8 --seed 42 --history-lengths 1,5,20 --max-train-windows 4000

# Navigation only (drop keyboard_shortcut), merge into prior summary
python src/activity_model/experiments/evaluate_real_csv.py \
  --csv activity_log.csv --views navigation --merge-summary \
  --epochs 8 --seed 42 --history-lengths 1,5,20 --max-train-windows 4000
```

| View | Filter |
|------|--------|
| raw | known qstk types |
| cleaned | drop modifier-only keys; collapse consecutive same-pane `pane_focus` |
| **navigation** | **drop all `keyboard_shortcut`**, then cleaned focus-burst collapse |

Temporal session holdout; train/val capped; test not subsampled.

## Results (seed=42)

| View | Events | Test N | SSM top-1 | Markov-1 | Most-freq | Random | SSM top-3 | Macro-F1 |
|------|-------:|-------:|----------:|---------:|----------:|-------:|----------:|---------:|
| raw | 28779 | 2800 | 56.32% | 55.86% | 44.25% | 6.36% | 93.07% | 0.103 |
| cleaned | 14174 | 2151 | 50.26% | 48.68% | 36.77% | 6.69% | 87.91% | 0.088 |
| **navigation** | **11644** | **1600** | **57.19%** | **55.13%** | **39.44%** | **6.94%** | **92.81%** | **0.078** |

Navigation histogram after drop: `pane_focus` 5149, `click` 4714, `text_input` 991, `pane_open` 422, `pane_close` 344, `chat_message` 21, `search_query` 3.

### History ablation (navigation)

| L | SSM top-1 | Markov-1 | Δ vs Markov-1 |
|--:|----------:|---------:|--------------:|
| 1 | 49.91% | 57.92% | **-8.01pp** |
| 5 | 58.54% | 57.92% | +0.62pp |
| 20 | **59.68%** | 57.92% | **+1.76pp** |

With keyboard removed, **L=1 clearly underperforms** Markov-1; L=5/20 recover and slightly beat it. That is weaker than a dramatic long-range win, but it is the first real-data hint that history beyond the last event helps on navigation sequences.

Per-class F1 (navigation) concentrates on `pane_focus` / `click` (~0.62 each); rarer opens/closes still need more data or a richer label (e.g. pane type / click target).

## Interpretation

- Beating most-frequent by ~18pp on navigation (57% vs 39%) shows **structured transitions among focus/click/pane actions**, not just majority guessing.
- SSM ≈ Markov-1 at the default L=20 window, with a small edge once L≥5 on the fixed-target ablation — consistent with short navigation motifs rather than deep memory.
- This supports the Cursor-Tab thesis: propose the next **UI step** (focus/open/click) from recent navigation context; text/code generation can remain a routed submodel (see ensembling note below).

## Ensembling sketch

Activity SSM as fast gater over navigation routes → specialist / LLM genes when confidence is low (`npcpy.ft.model_ensembler.ResponseRouter` shape). Studio `agent_action` labels become better gater targets once vocab is unified.

## Rich labels (paneType + click targets)

Coarse type alone is not enough for Cursor-Tab (“next: click” is weak). This experiment predicts structured labels on the **navigation** stream:

- `pane_focus:terminal`, `pane_open:browser`, `pane_close:agent`, …
- `click:Stage file`, `click:New Agent`, … (labels with ≥10 occurrences)
- rare clicks → `click:OTHER`

```bash
python src/activity_model/experiments/evaluate_rich_labels.py \
  --csv activity_log.csv --epochs 8 --seed 42 \
  --history-lengths 1,5,20 --max-train-windows 4000 --min-click-count 10
```

### Results (seed=42, vocab=114)

Chance ≈ 0.9% (1/114). Test N=1600.

| Model | Top-1 | Top-3 | Macro-F1 |
|------:|------:|------:|---------:|
| **SSM** | **44.81%** | **60.00%** | 0.085 |
| Markov-1 | 43.75% | 59.19% | 0.092 |
| Most-freq | 23.94% | 35.06% | ~0 |
| Random | 0.75% | 2.75% | ~0 |

History ablation (fixed targets): L=1/5/20 SSM ≈ 50.9 / 51.2 / 51.4% vs Markov-1 51.4% — still near Markov-1, but absolute accuracy remains far above chance on a **114-way** problem.

### What the model actually suggests

Highest per-class F1 includes actionable UI steps, e.g.:

- `pane_open:terminal` (~0.95)
- `click:Commit staged changes` / `click:Stage file` / `click:Push` (~0.83–0.85)
- `pane_focus:terminal` (~0.62)
- `text_input:Search or enter URL...` (~0.57)

Example high-confidence suggestions look like Cursor-Tab chips: `pane_open:terminal` (p≈0.95), `pane_focus:terminal` with runners-up like `click:New Bash Terminal`.

Common confusions are still navigation-adjacent (`text_input`→`pane_focus:terminal`, agent focus→`click:OTHER`), not random classes.

### Takeaway

Rich labels make the prediction **product-shaped**: not “you will click,” but “you will open a terminal / stage a file / focus the browser.” SSM beats most-frequent by ~21pp and tracks Markov-1 on short motifs — good evidence that these sequences are learnable enough to prototype suggestions, while longer-horizon / LLM routing remains useful for rarer or open-ended steps.

## Next

- Include click/pane context in the UI suggestion payload (`label`, `paneType`).
- More `agent_action` rows after studio-action tracking matures.
- Optional: further downsample repeated `pane_focus:terminal` without dropping the class.
