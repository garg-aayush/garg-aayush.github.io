# Raw statistics of the answer runs (no quality labels)

Refusal columns are string matching, not judgments: "exact" is the fixed sentence, "heuristic" is a regular expression for refusals in other words (see `stats.mjs`). Split as answerable / unanswerable questions. Spreads are min / median / mean / max.

| Model | Done / failed | Empty (A/U) | Exact refusal (A/U) | Refusal in other words, heuristic (A/U) | Stop: sentences / eos / length |
|---|---|---|---|---|---|
| qwen3 | 45 / 0 | 0 (0/0) | 8 (5/3) | 0 (0/0) | 1 / 44 / 0 |
| granite | 45 / 0 | 0 (0/0) | 0 (0/0) | 2 (0/2) | 13 / 32 / 0 |
| lfm | 45 / 0 | 0 (0/0) | 0 (0/0) | 0 (0/0) | 0 / 45 / 0 |
| qwen35 | 45 / 0 | 0 (0/0) | 2 (0/2) | 11 (4/7) | 0 / 45 / 0 |

| Model | Answer characters | Answer tokens | Prompt tokens | Item ms | First token ms | Decode tokens per second | Load ms | Run s | Peak browser memory GB |
|---|---|---|---|---|---|---|---|---|---|
| qwen3 | 38 / 122 / 138.6 / 395 | 10 / 29 / 32.5 / 75 | 403 / 782 / 775.9 / 1197 | 320 / 719 / 797.2 / 1850 | 244 / 432 / 513.9 / 1732 | 77.8 / 111.6 / 111.9 / 138 | 2731 | 39.8 | 7.51 |
| granite | 41 / 164 / 164.2 / 357 | 13 / 35 / 37 / 85 | 392 / 759 / 752.7 / 1058 | 166 / 412 / 420.4 / 932 | 102 / 183 / 202.4 / 516 | 142.9 / 165.5 / 166.8 / 192.2 | 757 | 20.2 | 8.34 |
| lfm | 3 / 78 / 105.3 / 454 | 2 / 20 / 25 / 86 | 414 / 796 / 790.9 / 1097 | 91 / 185 / 193.4 / 460 | 53 / 99 / 98.8 / 137 | 177 / 267.8 / 256.6 / 298.1 | 879 | 10.1 | 2.21 |
| qwen35 | 38 / 113 / 125.3 / 245 | 12 / 28 / 30.9 / 59 | 409 / 793 / 788.3 / 1219 | 292 / 608 / 615.2 / 995 | 130 / 262 / 257.9 / 398 | 60.4 / 87 / 84.4 / 101.7 | 1588 | 30.1 | 3.88 |
