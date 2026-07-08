import { describe, expect, it } from "vitest";
import {
  computeFinalScore,
  DIFFICULTY_MULTIPLIER,
  GUIDE_PENALTY,
  TRAIT_KEYS,
  TRAIT_WEIGHTS,
  type TraitScores,
} from "@/lib/game/scoring";

function uniform(value: number): TraitScores {
  return Object.fromEntries(
    TRAIT_KEYS.map((key) => [key, value]),
  ) as TraitScores;
}

describe("scoring config (locked build-plan numbers)", () => {
  it("keeps the difficulty multipliers from the plan", () => {
    expect(DIFFICULTY_MULTIPLIER).toEqual({
      rookie: 1.0,
      detective: 1.05,
      cold_case: 1.15,
    });
  });

  it("keeps the x0.95 guide penalty", () => {
    expect(GUIDE_PENALTY).toBe(0.95);
  });

  it("weights marks and hair up, mouth down", () => {
    const { distinctiveMarks, hairStyle, mouth, ...rest } = TRAIT_WEIGHTS;
    const others = Object.values(rest);
    expect(Math.min(distinctiveMarks, hairStyle)).toBeGreaterThan(
      Math.max(...others),
    );
    expect(mouth).toBeLessThan(Math.min(...others));
  });
});

describe("computeFinalScore", () => {
  it("scores a blank-judge verdict (all zeros) as 0", () => {
    const result = computeFinalScore(uniform(0), "rookie", false);
    expect(result.weightedBase).toBe(0);
    expect(result.finalScore).toBe(0);
  });

  it("is the identity on uniform scores at rookie without the guide", () => {
    // Weights are normalized by their own sum, so uniform traits pass through.
    for (const value of [10, 42.5, 77, 100]) {
      const result = computeFinalScore(uniform(value), "rookie", false);
      expect(result.weightedBase).toBeCloseTo(value, 1);
      expect(result.finalScore).toBeCloseTo(value, 1);
    }
  });

  it("applies the difficulty multiplier", () => {
    const base = uniform(60);
    expect(computeFinalScore(base, "detective", false).finalScore).toBe(63);
    expect(computeFinalScore(base, "cold_case", false).finalScore).toBe(69);
  });

  it("applies the guide penalty and reports both multipliers", () => {
    const result = computeFinalScore(uniform(80), "rookie", true);
    expect(result.finalScore).toBe(76);
    expect(result.multipliers).toEqual({ difficulty: 1.0, guide: 0.95 });
  });

  it("stacks difficulty and guide multiplicatively", () => {
    const result = computeFinalScore(uniform(60), "cold_case", true);
    expect(result.finalScore).toBeCloseTo(60 * 1.15 * 0.95, 1);
  });

  it("clamps the final score to 100 (cold_case can't overflow)", () => {
    const result = computeFinalScore(uniform(100), "cold_case", false);
    expect(result.finalScore).toBe(100);
  });

  it("clamps out-of-range judge values before weighting", () => {
    const wild = { ...uniform(50), nose: 400, mouth: -50 } as TraitScores;
    const tamed = { ...uniform(50), nose: 100, mouth: 0 } as TraitScores;
    expect(computeFinalScore(wild, "rookie", false)).toEqual(
      computeFinalScore(tamed, "rookie", false),
    );
  });

  it("rewards nailing the identifying traits over the generic ones", () => {
    // Same total raw points, distributed differently: marks+hair vs
    // mouth+proportions. The identifying pair must win.
    const identifying = {
      ...uniform(50),
      distinctiveMarks: 90,
      hairStyle: 90,
    } as TraitScores;
    const generic = {
      ...uniform(50),
      mouth: 90,
      proportions: 90,
    } as TraitScores;
    expect(
      computeFinalScore(identifying, "rookie", false).finalScore,
    ).toBeGreaterThan(computeFinalScore(generic, "rookie", false).finalScore);
  });

  it("rounds to one decimal place", () => {
    const result = computeFinalScore(uniform(33.333), "detective", true);
    expect(result.finalScore).toBe(
      Math.round(result.finalScore * 10) / 10,
    );
    expect(result.weightedBase).toBe(
      Math.round(result.weightedBase * 10) / 10,
    );
  });
});