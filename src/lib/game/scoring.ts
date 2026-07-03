/**
 * Final-score computation (Phase 4). The judge returns raw 0-100 trait
 * scores; the number the player sees is computed HERE, in our code, from a
 * tunable weight table — never inside the model call.
 *
 * Pure module: no env, no IO — usable from route handlers, the calibration
 * script, and (Phase 8) Vitest.
 */
import type { Difficulty } from "./trait-sheet";

/** Bump when weights/multipliers change; stored in every score_breakdown. */
export const SCORING_VERSION = "1.0.0";

export const TRAIT_KEYS = [
  "faceShape",
  "proportions",
  "hairStyle",
  "eyebrows",
  "eyes",
  "nose",
  "mouth",
  "distinctiveMarks",
] as const;
export type TraitKey = (typeof TRAIT_KEYS)[number];

export type TraitScores = Record<TraitKey, number>;

/**
 * Marks and hair carry the most identifying signal, so they weigh up; the
 * mouth is the least distinctive feature, so it weighs slightly down.
 */
export const TRAIT_WEIGHTS: Record<TraitKey, number> = {
  faceShape: 1.0,
  proportions: 1.0,
  hairStyle: 1.4,
  eyebrows: 1.0,
  eyes: 1.0,
  nose: 1.1,
  mouth: 0.8,
  distinctiveMarks: 1.5,
};

/** Vaguer statements are harder to draw from, so they pay out more. */
export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = {
  rookie: 1.0,
  detective: 1.05,
  cold_case: 1.15,
};

/** The silhouette guide is an assist, not a free lunch. */
export const GUIDE_PENALTY = 0.95;

export type ScoreComputation = {
  /** Weighted mean of the raw trait scores, before multipliers. */
  weightedBase: number;
  /** What the player sees: base x difficulty x guide, clamped to 0-100. */
  finalScore: number;
  multipliers: { difficulty: number; guide: number };
};

const clamp100 = (n: number) => Math.min(100, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeFinalScore(
  traits: TraitScores,
  difficulty: Difficulty,
  usedGuide: boolean,
): ScoreComputation {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const key of TRAIT_KEYS) {
    weightedSum += clamp100(traits[key]) * TRAIT_WEIGHTS[key];
    weightTotal += TRAIT_WEIGHTS[key];
  }
  const weightedBase = weightedSum / weightTotal;

  const multipliers = {
    difficulty: DIFFICULTY_MULTIPLIER[difficulty],
    guide: usedGuide ? GUIDE_PENALTY : 1,
  };

  return {
    weightedBase: round1(weightedBase),
    finalScore: round1(
      clamp100(weightedBase * multipliers.difficulty * multipliers.guide),
    ),
    multipliers,
  };
}