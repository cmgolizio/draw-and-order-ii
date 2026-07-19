import { describe, expect, it } from "vitest";
import {
  TraitSheetSchema,
  traitSheetLines,
  type TraitSheet,
} from "@/lib/game/trait-sheet";
import { makeRng, rollTraits } from "../../scripts/pipeline/traits";

/** One seeded batch, reused across assertions — big enough that a sex or
 *  facial-hair gate bug can't slip through by luck. */
const BATCH_SIZE = 500;
const rng = makeRng(20260711);
const batch: TraitSheet[] = Array.from({ length: BATCH_SIZE }, () =>
  rollTraits(rng),
);

describe("rollTraits (trait sheet v2)", () => {
  it("produces both sexes in a roughly even mix", () => {
    const females = batch.filter((t) => t.sex === "female").length;
    const males = batch.filter((t) => t.sex === "male").length;
    expect(females + males).toBe(BATCH_SIZE);
    // ~50/50 target; generous bounds so tuning FEMALE_SHARE doesn't flap.
    expect(females).toBeGreaterThan(BATCH_SIZE * 0.3);
    expect(males).toBeGreaterThan(BATCH_SIZE * 0.3);
  });

  it("never rolls facial hair for a female suspect", () => {
    for (const traits of batch.filter((t) => t.sex === "female")) {
      expect(traits.facialHair).toBeUndefined();
    }
  });

  it("always rolls a facial-hair value (incl. clean-shaven) for males", () => {
    for (const traits of batch.filter((t) => t.sex === "male")) {
      expect(traits.facialHair).toBeTruthy();
    }
  });

  it("never rolls a bald female", () => {
    for (const traits of batch.filter((t) => t.sex === "female")) {
      expect(traits.hair).not.toMatch(/bald|shaved head/);
    }
  });

  it("produces sheets that validate against TraitSheetSchema", () => {
    for (const traits of batch) {
      expect(() => TraitSheetSchema.parse(traits)).not.toThrow();
    }
  });

  it("honors a forced sex (Phase 4 batch quota) including its gates", () => {
    const quotaRng = makeRng(42);
    for (let i = 0; i < 50; i++) {
      const forced = i % 2 === 0 ? "female" : "male";
      const traits = rollTraits(quotaRng, forced);
      expect(traits.sex).toBe(forced);
      if (forced === "female") {
        expect(traits.facialHair).toBeUndefined();
        expect(traits.hair).not.toMatch(/bald|shaved head/);
      } else {
        expect(traits.facialHair).toBeTruthy();
      }
    }
  });
});

describe("traitSheetLines", () => {
  const female = batch.find((t) => t.sex === "female")!;
  const male = batch.find((t) => t.sex === "male")!;

  it("leads with the sex line", () => {
    expect(traitSheetLines(male)[0]).toBe("Sex: male");
    expect(traitSheetLines(female)[0]).toBe("Sex: female");
  });

  it("drops the facial-hair line entirely on female sheets", () => {
    expect(
      traitSheetLines(female).some((line) => line.startsWith("Facial hair:")),
    ).toBe(false);
  });

  it("keeps the facial-hair line on male sheets", () => {
    expect(traitSheetLines(male)).toContain(`Facial hair: ${male.facialHair}`);
  });
});

describe("TraitSheetSchema legacy compatibility", () => {
  // Shape of every pre-v2 suspect row: no sex key, facialHair always set.
  const legacy = {
    age: "mid-40s",
    build: "lean",
    faceShape: "oblong",
    hair: "swept back, graying temples",
    facialHair: "mustache",
    eyebrows: "sparse, arched",
    eyes: "deep-set",
    nose: "crooked, old break to the left",
    mouth: "thin-lipped",
    distinguishingMarks: [],
    expression: "flat",
    complexion: "pale",
    accessories: [],
  };

  it("parses a pre-v2 sheet (the all-male pool) as male", () => {
    const parsed = TraitSheetSchema.parse(legacy);
    expect(parsed.sex).toBe("male");
    expect(parsed.facialHair).toBe("mustache");
  });

  it("still rejects a sheet missing required traits", () => {
    const broken: Record<string, unknown> = { ...legacy };
    delete broken.nose;
    expect(TraitSheetSchema.safeParse(broken).success).toBe(false);
  });
});