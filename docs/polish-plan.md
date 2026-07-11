# Draw & Order — Polish & Content v2 Plan

Sequel to `docs/build-plan.md`. Same contract: **locked decisions are non-negotiable**, and every phase has acceptance criteria — check them before declaring a phase done. This plan assumes v1 shipped and is live; it does not re-litigate v1 decisions, it extends them.

Read `docs/build-plan.md` first for the invariants this plan preserves.

## Preserved invariants (from build-plan.md — do not break)

- The live app never calls a generation or statement API. All suspect data — traits, statement, images, and now the Q&A bank — is produced by the offline pipeline and read from Postgres. **Q&A answers are precomputed, never generated live.**
- Server-side scoring by `suspect_id`; the suspect image is never sent to the client before reveal.
- No fabricated scores. Judge failure returns an honest error and leaves the round open.
- Grayscale-only drawing. RLS on every table; `image_path` never exposed to the client role.

## Locked decisions (v2)

- **New difficulty `cadet`, below `rookie`.** It turns every knob toward easiest at once: a composite-style **line-art** reference image (not a photo), traits rolled from a reduced high-contrast subset, the most explicit statement, no red herring, the largest question budget, and a **0.90** score multiplier (below rookie's 1.0 so easy mode can't top the leaderboard).
- **`sex` trait: binary `male` | `female`.** Gender-conditional trait rolls; statement and image prompts are pronoun-aware.
- **Statements:** rotate distinct witness personas, ban stock openings, and enforce a **required-feature checklist per difficulty** — the same talking points every time, a unique voice every time.
- **Q&A:** a fixed bank of ~8 questions per suspect (one per major trait), answered in witness voice, generated in the pipeline and stored on the suspect row. The question set is identical across suspects; only answers vary. Per-round **budget** by difficulty (cadet 5 / rookie 3 / detective 2 / cold_case 1 — tune). Spending questions carries **no extra score penalty**; the budget is the only constraint.
- **One full pool regeneration** after the pipeline rework lands (Phase 4). Cadet suspects are added **additively** later (Phase 7) — no second wipe.

## Ordering rationale

The pipeline files (`scripts/pipeline/traits.ts`, `scripts/pipeline/statement.ts`) are the root of the statement, gender, and coverage problems, and all of it feeds a single regeneration — so do that work first (Phases 1–3), then regenerate once (Phase 4). The Q&A bank is additive pipeline work that must exist *before* the regeneration so the new pool ships with it. Onboarding and terminology touch no pipeline code and are **parallel-safe** — Phase 6 can run at any point. The Cadet tier is last because it is the only item that forks **both** the image pipeline and the judge, and it is purely additive (a new batch, no wipe).

---

## Phase 1 — Trait sheet v2: sex + gender-conditional rolls

**Objective:** the canonical trait sheet models sex and rolls gender-appropriate features; the existing three difficulties still generate correctly.

Tasks:

1. Add `sex: 'male' | 'female'` to `TraitSheetSchema` and `traitSheetLines` in `src/lib/game/trait-sheet.ts`.
2. In `scripts/pipeline/traits.ts`: roll `sex` first (~50/50, tunable). Gate `FACIAL_HAIR` to male — a female suspect is always clean-shaven and the facial-hair line is dropped, not set to a value. Add feminine hair styles (split the hair table or branch on sex). Neutralize or branch the male-coded build language. Keep the shared features (eyes, nose, eyebrows, mouth, marks, complexion, expression) common to both.
3. The judge reads `traitSheetLines`, so the sex line flows through automatically — verify `JUDGE_SYSTEM_PROMPT` in `src/lib/game/judge.ts` still reads cleanly with it and needs no change.
4. Update `scripts/lib/seed-data.ts` fixtures and any unit test asserting trait shape.

**Acceptance:** `rollTraits` produces both sexes; no female suspect ever rolls facial hair; a mock-provider `generate-suspects` run completes for all three existing difficulties; trait-sheet unit tests pass.

---

## Phase 2 — Statement engine v2: personas, banned openings, feature checklist

**Objective:** statements sound unique per suspect and cover a defined feature set per difficulty.

Tasks:

1. In `scripts/pipeline/statement.ts`: define a set of witness **personas** (distinct voice, vocabulary, cadence — e.g. terse hostile witness, nervous overexplainer, precise cop-adjacent observer, elderly rambler). Select one per suspect (seeded) and inject it into the prompt.
2. Add an explicit **banned-openings** list as a hard rule ("I only saw him for a moment", "It was over fast", "I'd know him again", and similar) so the model stops converging on stock intros.
3. Replace "cover 8–10 features" with a **required-feature checklist per difficulty**, stated explicitly in the brief so coverage is deterministic across suspects:
   - `rookie`: eyes, eyebrows, nose, mouth, face shape, hair, build, complexion + every distinguishing mark.
   - `detective`: a named subset of 5–6, some hedged.
   - `cold_case`: 3–4, vague, plus the one non-physical red herring.
4. Pronoun-aware from Phase 1's `sex` field.
5. Bump `STATEMENT_PROMPT_VERSION`.
6. Add a cross-suspect variety check to the batch script: flag near-duplicate openings or teasers for review.

**Acceptance:** a batch of 10 produces no two shared openings; every `rookie` statement hits the full checklist (assert against the trait keys mentioned, or spot-check); personas are visibly distinct; version bumped and recorded in `model_info`.

---

## Phase 3 — Q&A bank generation + storage

**Objective:** every suspect carries a precomputed witness Q&A bank.

Tasks:

1. Migration: add `qa_bank jsonb` to `suspects` (array of `{ trait, question, answer }`). Add it to the `suspects_public` security-barrier view — questions and answers are safe to serve; `image_path` still is not.
2. New pipeline module `scripts/pipeline/qa.ts`. In the same suspect pass, generate the fixed question set (one per major trait) with witness-voice answers derived from the trait sheet. Questions are identical across suspects (stable list the app can render); only answers are suspect-specific.
3. Store `qa_bank` on the suspect row alongside the statement. Log cost like statement/image.

**Acceptance:** one suspect end-to-end has a full `qa_bank`; questions are identical across suspects and answers are suspect-specific and in witness voice; the client role can read `qa_bank` through `suspects_public` but still cannot read `image_path`.

---

## Phase 4 — Pool wipe + regeneration

**Objective:** replace the live pool with v2 content (better statements, a gender mix, the Q&A bank).

**Decision (resolved):** existing `rounds` reference `suspect_id`, so a hard `DELETE` would orphan historical results pages. Regeneration therefore **retires** old suspects (`status='retired'`, rows kept for FK integrity) and generates a fresh live batch — it does not delete. Reassign dailies from the new pool.

Tasks:

1. Confirm the image-gen spend budget before running; log projected cost.
2. Retire the current live pool; clear `daily_suspects` forward assignments.
3. Regenerate ~40 rookie / 40 detective / 20 cold_case with a target sex split. Run the review CLI (`scripts/review-suspects.ts`), approve to `live`. Re-run `scripts/assign-daily.ts` for the next N days.

**Acceptance:** the live pool is entirely v2 suspects; historical results pages still resolve (old suspects retired, not deleted); dailies queued; sex split within target; per-suspect costs logged.

---

## Phase 5 — Live Q&A interrogation surface

**Objective:** players can spend a question budget to reveal trait answers during a round.

**Decision (resolved):** the answers are flavor, not the suspect image, and knowing traits better just helps you draw better — which is the point of the game — so budget enforcement is **client-side**: send the full `qa_bank` at round start and enforce the count in the client. This adds zero round-trips and is the simplest correct thing. It is *not* anti-cheat-grade; if the daily leaderboard ever gets real stakes, upgrade to a server-decremented counter on the round row. Note the tradeoff in code.

Tasks:

1. Round creation returns the `qa_bank` questions + answers and the difficulty's budget.
2. UI: an **"Interrogate the witness"** panel in the case file — desktop side panel and mobile bottom sheet (extend `src/components/draw/CaseFilePanel.tsx`). Show the fixed question list, remaining budget, and revealed answers, themed to match.
3. Record which questions were asked in `score_breakdown` (for the record; no score effect).

**Acceptance:** budget enforced per difficulty; asking reveals the answer and decrements the counter; no score penalty applied; works in the mobile bottom sheet; state survives the draw session.

---

## Phase 6 — Onboarding + terminology (parallel-safe)

**Objective:** a new player understands the game and the controls without relying on hover tooltips — this app is mobile-first, and hover titles don't exist on touch.

Tasks:

1. One-time **"How a case works"** overlay on first visit (localStorage flag), three steps, dismissible, re-openable from a persistent help affordance. Respect `prefers-reduced-motion`.
2. First-round **inline hints** on the draw page: what the toolbar does, and what "Turn yourself in" means.
3. **Terminology consistency pass.** `src/components/draw/ToolBar.tsx` is bare ("Pencil / Eraser / Undo / Clear") while the round flow is heavily themed. Make the app read consistently — keep tool labels literal but decode the themed CTAs. Clarify "Turn yourself in" so give-up/reveal is legible (keep the phrase, pair it with a "(reveal the suspect)" hint on first encounter).
4. Replace `title=`-only tooltips with an accessible primitive **or** the inline hints above, so touch and keyboard users get the same information.
5. Remove the **duplicate mobile guide toggle** — the silhouette is toggled by both a FAB and the toolbar in `src/components/draw/DraftWorkspace.tsx`. Keep one.

**Acceptance:** the first-visit overlay shows once and is re-openable; a touch user with no mouse can learn what every control does; no control depends solely on a hover title; terminology reads consistently across pages.

---

## Phase 7 — Cadet tier: composite art + judge (additive; last)

**Objective:** an easiest tier whose reference is a composite-style line portrait, scored fairly against a pencil sketch.

Tasks:

1. **Schema/config:** extend the difficulty check constraint to include `cadet` (migration); add it to the `Difficulty` union and `DIFFICULTIES` in `src/lib/game/trait-sheet.ts`, to `DIFFICULTY_MULTIPLIER` (0.90) in `src/lib/game/scoring.ts`, to the difficulty briefs in `statement.ts`, to `DIFFICULTY_OPTIONS` in `RoundGame.tsx`, and to `DIFFICULTY_LABEL` in `CaseFilePanel.tsx`.
2. **Traits:** cadet rolls from a reduced high-contrast subset — bold face shapes, large/obvious marks, distinctive hair, strong noses — the simplest, most identifiable faces. Add a `rollCadetTraits` variant or a filtered table set.
3. **Image pipeline:** a second style in `scripts/pipeline/image-gen.ts` — a composite/line-art prompt path (clean grayscale line portrait, neutral background) selected when `difficulty === 'cadet'`, behind the existing provider adapter, normalized to the same 800×1040. Bump `IMAGE_PROMPT_VERSION`.
4. **Judge:** add a line-art-vs-sketch calibration reference set under `scripts/calibration/`; verify blank still scores < 10 and a good cadet sketch scores sensibly. The judge still judges likeness the same way — the only change is that this tier's reference is itself a drawing. Bump `JUDGE_PROMPT_VERSION` only if the prompt actually changes; re-run calibration regardless.
5. **Statement/Q&A:** most explicit statement, no red herring, full checklist, largest question budget.
6. Generate a batch of cadet suspects **additively** (no wipe), review, approve to `live`.

**Acceptance:** cadet is selectable in practice; the reference renders as a line portrait; the judge scores cadet sketches sensibly against the calibration set; the 0.90 multiplier applies; blank canvas still near-zero; no regression to the photo tiers' scoring.

---

## Phase 8 — Hardening & cleanup

**Objective:** close the loose ends surfaced in review.

Tasks:

1. **Judge variance:** observe run-to-run variance on a fixed sketch; decide whether smoothing is warranted (likely leave as-is) and record the decision.
2. **Empty leaderboard:** replace the board-of-one with a "be the first" state until N entries exist.
3. **Image crop:** verify `fit: "cover", position: "top"` in `image-gen.ts` isn't decapitating tall renders in the regenerated pool.
4. **Tests:** unit coverage for the cadet multiplier and the question-budget logic; a Playwright pass covering cadet selection and the Q&A panel.
5. Re-run `npm run launch-audit`.

**Acceptance:** launch-audit clean; new tests green; no board-of-one; regenerated images framed correctly.

---

## Suggested sizing

P1–P3 are back-to-back pipeline sessions (one each). P4 is a shorter run-and-review session gated on spend. P5 and P6 are one session each; P6 can slot in anywhere. P7 is the largest — budget it as one-and-a-half sessions. P8 is cleanup. Roughly a week of focused part-time work, with P7 the long pole.
