# Judge calibration

Sanity-checks the Phase 4 scoring judge (`src/lib/game/judge.ts`) against a
fixed reference set. **Run this whenever the judge prompt
(`JUDGE_PROMPT_VERSION`) or the scoring weights (`SCORING_VERSION`) change**,
and keep the emitted `results-*.json` files checked in so rubric drift is
visible in review.

```bash
npm run calibrate-judge                      # first live suspect with an image
npm run calibrate-judge -- --suspect <uuid>  # pin the suspect under test
npm run calibrate-judge -- --model <model>   # try a different judge model
npm run calibrate-judge -- --drawings-only   # (re)generate drawings/, no API calls
```

Requires `.env.local` with `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
and `SUPABASE_SECRET_KEY`, plus at least one live suspect with an image
(two for the wrong-face check).

## Reference set

Fixed drawings (`drawings/`, deterministic, committed):

| drawing                                              | expectation                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `blank`                                              | final score **< 10** (hard requirement from the build plan) |
| `scribble-light`, `scribble-dense`                   | ≤ 15                                                        |
| `shapes`, `text-page` (non-face content)             | ≤ 15                                                        |
| `smiley`                                             | ≤ 40                                                        |
| `generic-face` (competent, but nobody in particular) | ≤ 55                                                        |

Derived at runtime from the suspect pool (not committed):

| drawing                                                  | expectation                    |
| -------------------------------------------------------- | ------------------------------ |
| `traced-self` — the suspect's own portrait, sketch-ified | ≥ 55                           |
| `traced-self-faint` — same, heavily degraded             | recorded only                  |
| `traced-other` — a _different_ suspect, sketch-ified     | must score below `traced-self` |

The `traced-self` vs `traced-other` ordering is the core likeness check: if
the wrong face ever wins, the judge is grading draftsmanship, not likeness.

Each run costs ~10 judge calls; per-call costs are printed and appended to
`pipeline-costs.jsonl`.
