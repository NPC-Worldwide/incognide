# History-length ablation results (seed=42)

## Question

Does the activity SSM benefit from longer history, or does it behave like Markov-1?

## Method

```bash
python src/activity_model/experiments/ablate_history_length.py \
  --distribution all --lengths 1,5,10,20,50 \
  --sessions 80 --session-length 80 --epochs 12 --seed 42
```

Controls:

- Same generator, seed, session split, architecture (`model_dim=32`, `state_dim=64`, 1 layer), epochs, metrics as the main synthetic experiment.
- **Fixed prediction targets:** `min_seq_len = 50` for every L, so only the history window length changes.
- Test set: 360 windows per condition.
- Markov-1 uses only the last observed action (flat across L, as expected).

Plot: `history_ablation_top1.png` (also under `experiments/activity_next_action/history_ablation/results/`).

## Results

| Distribution | History L | SSM Top-1 | Markov-1 Top-1 | Improvement |
| ------------ | --------: | --------: | -------------: | ----------: |
| Poisson      |         1 |    15.56% |         16.39% |      -0.83pp |
| Poisson      |         5 |    17.50% |         16.39% |      +1.11pp |
| Poisson      |        10 |    17.22% |         16.39% |      +0.83pp |
| Poisson      |        20 |    17.50% |         16.39% |      +1.11pp |
| Poisson      |        50 |    16.39% |         16.39% |       0.00pp |
| Uniform      |         1 |     6.11% |          7.22% |      -1.11pp |
| Uniform      |         5 |     4.17% |          7.22% |      -3.06pp |
| Uniform      |        10 |     4.44% |          7.22% |      -2.78pp |
| Uniform      |        20 |     4.72% |          7.22% |      -2.50pp |
| Uniform      |        50 |     5.00% |          7.22% |      -2.22pp |
| Gaussian     |         1 |    46.11% |         48.06% |      -1.94pp |
| Gaussian     |         5 |    46.39% |         48.06% |      -1.67pp |
| Gaussian     |        10 |    47.22% |         48.06% |      -0.83pp |
| Gaussian     |        20 |    46.67% |         48.06% |      -1.39pp |
| Gaussian     |        50 |    46.67% |         48.06% |      -1.39pp |

### Change in SSM top-1 vs L=1

| Distribution | L=5 | L=10 | L=20 | L=50 |
| ------------ | --: | ---: | ---: | ---: |
| Poisson      | +1.94pp | +1.67pp | +1.94pp | +0.83pp |
| Uniform      | -1.94pp | -1.67pp | -1.39pp | -1.11pp |
| Gaussian     | +0.28pp | +1.11pp | +0.56pp | +0.56pp |

## Interpretation

On these synthetic processes, increasing L does **not** produce a clear, monotonic gain. The largest SSM-vs-L=1 move is about **+2pp** (Poisson), within a small band; Uniform gets worse with longer history; Gaussian stays ~1–2pp **below** Markov-1 at every L.

**Conclusion:** this ablation does **not** provide strong evidence that the current SSM configuration is using information beyond the immediately preceding action. Performance tracks Markov-1 closely; longer context does not reliably help.
