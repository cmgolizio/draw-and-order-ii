/**
 * Consistency check (Claude vision): does the rendered image actually match
 * the trait sheet? Fidelity 0-100; below threshold the pipeline regenerates
 * the image (max 2 retries) or falls back to status='draft'.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TraitSheet } from "./traits";
import { traitSheetLines } from "./traits";
import type { CostTracker } from "./costs";

export const CONSISTENCY_PROMPT_VERSION = "1.0.0";
export const DEFAULT_FIDELITY_THRESHOLD = 70;

const ConsistencySchema = z.object({
  fidelity: z
    .number()
    .describe("0-100: how faithfully the image matches the trait sheet."),
  mismatches: z
    .array(z.string())
    .describe("Traits the image gets wrong or omits; empty if none."),
  faceCovered: z
    .boolean()
    .describe("True if anything covers part of the face (hard fail)."),
});

export type ConsistencyReport = z.infer<typeof ConsistencySchema>;

export async function checkConsistency(
  client: Anthropic,
  model: string,
  traits: TraitSheet,
  imagePng: Buffer,
  costs: CostTracker,
  attemptLabel: string,
): Promise<ConsistencyReport> {
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You are a forensic image auditor for a fictional police-sketch game. " +
      "Compare a rendered portrait against its canonical trait sheet and score fidelity 0-100. " +
      "Judge only what the sheet specifies — do not penalize traits the sheet leaves open. " +
      "Weight identifying features (face shape, nose, eyebrows, hair, distinguishing marks) most heavily. " +
      "Anything covering the face is an automatic hard fail.",
    output_config: { format: zodOutputFormat(ConsistencySchema) },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: imagePng.toString("base64"),
            },
          },
          {
            type: "text",
            text: ["CANONICAL TRAIT SHEET", ...traitSheetLines(traits)].join("\n"),
          },
        ],
      },
    ],
  });
  costs.addClaude(`consistency (${attemptLabel})`, model, response.usage);

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("consistency check returned no parseable output");
  }
  return {
    ...parsed,
    fidelity: Math.max(0, Math.min(100, parsed.fidelity)),
  };
}