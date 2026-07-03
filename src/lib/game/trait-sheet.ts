/**
 * The canonical trait sheet — shared by the offline pipeline (rolls it,
 * renders from it) and the Phase 4 judge (scores against it). Lives in src/
 * so server routes can use it; scripts/pipeline/traits.ts re-exports it.
 */
import { z } from "zod";

export const DistinguishingMarkSchema = z.object({
  mark: z.string(),
  placement: z.string(),
});
export type DistinguishingMark = z.infer<typeof DistinguishingMarkSchema>;

export const TraitSheetSchema = z.object({
  age: z.string(),
  build: z.string(),
  faceShape: z.string(),
  hair: z.string(),
  facialHair: z.string(),
  eyebrows: z.string(),
  eyes: z.string(),
  nose: z.string(),
  mouth: z.string(),
  distinguishingMarks: z.array(DistinguishingMarkSchema),
  expression: z.string(),
  complexion: z.string(),
  accessories: z.array(z.string()),
});
export type TraitSheet = z.infer<typeof TraitSheetSchema>;

export type Difficulty = "rookie" | "detective" | "cold_case";
export const DIFFICULTIES: Difficulty[] = ["rookie", "detective", "cold_case"];

/** Flat human-readable lines, used in prompts, the review CLI, and the judge. */
export function traitSheetLines(traits: TraitSheet): string[] {
  return [
    `Age: ${traits.age}`,
    `Build: ${traits.build}`,
    `Face shape: ${traits.faceShape}`,
    `Hair: ${traits.hair}`,
    `Facial hair: ${traits.facialHair}`,
    `Eyebrows: ${traits.eyebrows}`,
    `Eyes: ${traits.eyes}`,
    `Nose: ${traits.nose}`,
    `Mouth: ${traits.mouth}`,
    `Expression: ${traits.expression}`,
    `Complexion: ${traits.complexion}`,
    `Distinguishing marks: ${
      traits.distinguishingMarks.length
        ? traits.distinguishingMarks
            .map((m) => `${m.mark} ${m.placement}`)
            .join("; ")
        : "none"
    }`,
    `Accessories: ${traits.accessories.length ? traits.accessories.join(", ") : "none"}`,
  ];
}