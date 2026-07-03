/**
 * The judge (Phase 4): ONE Claude vision call per submission — suspect photo,
 * player sketch, and the canonical trait sheet in a single request, structured
 * output enforced by schema.
 *
 * It judges LIKENESS, not artistic skill: a crude drawing that nails the
 * crooked nose and heavy brow must outscore a beautiful drawing of the wrong
 * face. If the call fails, callers return an honest error and leave the round
 * open — a fake score is never fabricated (v1's worst behavior; not ported).
 *
 * Pure-ish module: takes an Anthropic client, returns a verdict + usage.
 * No env access, so the calibration script can drive it directly.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { TRAIT_KEYS, type TraitScores } from "./scoring";
import { traitSheetLines, type TraitSheet } from "./trait-sheet";

/** Bump when the prompt changes — and re-run scripts/calibrate-judge.ts. */
export const JUDGE_PROMPT_VERSION = "1.0.0";

/** Sonnet-class is plenty for this; override via JUDGE_MODEL if needed. */
export const DEFAULT_JUDGE_MODEL = "claude-sonnet-5";

const traitScore = (what: string) =>
  z
    .number()
    .min(0)
    .max(100)
    .describe(`0-100: how well the sketch matches the suspect's ${what}.`);

const JudgeSchema = z.object({
  traits: z.object({
    faceShape: traitScore("overall face/head shape"),
    proportions: traitScore("facial proportions and feature placement"),
    hairStyle: traitScore("hair style, hairline, and facial hair"),
    eyebrows: traitScore("eyebrow shape, weight, and position"),
    eyes: traitScore("eye shape, size, and set"),
    nose: traitScore("nose shape and character"),
    mouth: traitScore("mouth and lip character"),
    distinctiveMarks: traitScore(
      "distinguishing marks (scars, moles, etc.) and their placement; " +
        "if the sheet lists none, score how well the sketch avoids inventing any",
    ),
  }),
  caseReport: z
    .string()
    .describe(
      "2-4 sentences, written as a dry detective reviewing the sketch.",
    ),
  bestFeature: z
    .enum(TRAIT_KEYS)
    .describe("The trait key the sketch captures best."),
  biggestMiss: z
    .enum(TRAIT_KEYS)
    .describe("The trait key the sketch misses worst."),
});

export type JudgeVerdict = z.infer<typeof JudgeSchema> & {
  traits: TraitScores;
};

export type JudgeResult = {
  verdict: JudgeVerdict;
  usage: { input_tokens: number; output_tokens: number };
};

const JUDGE_SYSTEM_PROMPT = `You are a forensic sketch evaluator for a fictional police-sketch game. You are shown the SUSPECT (a reference portrait) and a PLAYER SKETCH (a grayscale pencil drawing made from a witness statement), plus the suspect's canonical trait sheet.

Score how well the sketch captures the suspect's LIKENESS, trait by trait, 0-100 each.

Hard rules:
- Judge likeness, not artistic skill. A crude, wobbly drawing that nails the crooked nose and heavy brow MUST outscore a beautiful, polished drawing of the wrong face. Do not penalize line quality, shading technique, or draftsmanship.
- The sketch is grayscale pencil on paper by design — never penalize absence of color; judge hair/complexion by value and texture only.
- Score each trait against the trait sheet and reference portrait. A trait that is clearly attempted and close scores high; absent or contradicted scores low.
- A blank or near-blank canvas, or a drawing that is not a face at all (scribbles, shapes, writing), scores 0-5 on every trait.
- A generic face with no attempt at this suspect's specific features scores low (10-30 range) on most traits.
- distinctiveMarks: if the sheet lists marks, placement matters. If the sheet lists none, score 50 when the sketch invents none, lower if it adds prominent invented marks.
- The caseReport is 2-4 sentences in the voice of a dry, seen-it-all detective reviewing the sketch against the file. Refer to the drawing as "the sketch". No scores or numbers in the text.`;

export async function runJudge(
  client: Anthropic,
  model: string,
  args: {
    traits: TraitSheet;
    suspectPng: Uint8Array;
    drawingPng: Uint8Array;
  },
): Promise<JudgeResult> {
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: JUDGE_SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(JudgeSchema) },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "SUSPECT (reference portrait):" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: Buffer.from(args.suspectPng).toString("base64"),
            },
          },
          { type: "text", text: "PLAYER SKETCH:" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: Buffer.from(args.drawingPng).toString("base64"),
            },
          },
          {
            type: "text",
            text: ["CANONICAL TRAIT SHEET", ...traitSheetLines(args.traits)].join(
              "\n",
            ),
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("judge output truncated (max_tokens)");
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("judge returned no parseable output");
  }

  // Clamp defensively even though the schema bounds the values.
  const traits = Object.fromEntries(
    TRAIT_KEYS.map((key) => [
      key,
      Math.min(100, Math.max(0, Math.round(parsed.traits[key]))),
    ]),
  ) as TraitScores;

  return {
    verdict: { ...parsed, traits },
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}