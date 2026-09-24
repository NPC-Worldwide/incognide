# Experiment results (seed=42)

Ran via:

```bash
python src/activity_model/experiments/run_experiment.py \
  --distribution all --sessions 80 --session-length 40 \
  --sequence-length 20 --epochs 12 --seed 42
```

Windows per split: train=1960, val=420, test=420 (session-safe; no cross-split leakage).

Chance level for 16 actions ≈ 6.25% top-1.

| Distribution | Model top-1 | Model top-3 | Model macro-F1 | Markov-1 top-1 | Most-freq top-1 | Random top-1 |
| ------------ | ----------: | ----------: | -------------: | -------------: | --------------: | -----------: |
| Poisson      |      19.76% |      50.95% |         14.65% |         16.43% |          10.24% |        6.67% |
| Uniform      |       5.95% |      17.14% |          5.38% |          6.43% |           5.24% |        7.14% |
| Gaussian     |      45.71% |      65.00% |         46.33% |         45.71% |          10.48% |        7.86% |

Raw JSON: `experiments/activity_next_action/results/summary.json`.
