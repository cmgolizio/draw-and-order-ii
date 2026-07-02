/**
 * Witness statement generation (Claude). The statement is written FROM the
 * trait sheet — difficulty controls how much of the sheet survives into the
 * witness's account and how hedged the language is.
 *
 * Completeness is enforced: generous max_tokens, stop_reason checked, and the
 * result schema-validated — v1 shipped truncated descriptions to prod because
 * of max_tokens: 200. One retry on validation failure, then hard error.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Difficulty, TraitSheet } from "./traits";
import { traitSheetLines } from "./traits";
import type { CostTracker } from "./costs";

/** Bump when the prompt changes; stored in model_info per acceptance. */
export const STATEMENT_PROMPT_VERSION = "1.0.0";

const StatementSchema = z.object({
  statement: z
    .string()
    .describe("The full witness statement, first person, 60-160 words."),
  statement_teaser: z
    .string()
    .describe("One-line teaser for case cards, max 110 characters."),
});

export type GeneratedStatement = z.infer<typeof StatementSchema>;

const DIFFICULTY_BRIEF: Record<Difficulty, string> = {
  rookie: `Target detail level: ROOKIE.
- Cover 8-10 concrete features from the sheet with precise, confident language.
- The witness got a long, clear look. Specific placements ("scar through the left eyebrow"), no hedging.
- Every distinguishing mark on the sheet must appear, precisely placed.`,
  detective: `Target detail level: DETECTIVE.
- Cover only 5-6 features from the sheet; omit the rest entirely.
- Some hedging on one or two of them ("maybe mid-40s", "I think it was graying").
- The witness saw him briefly under decent light. Include at least one distinguishing mark if the sheet has any.`,
  cold_case: `Target detail level: COLD CASE.
- Cover only 3-4 features from the sheet, in vague terms; omit everything else.
- Heavy hedging ("it was dark", "it happened fast").
- Include exactly one subjective, red-herring-ish remark that is NOT a physical trait (e.g. "he looked like a man who owed money", "something off about how he walked"). It must not contradict the sheet.`,
};

export function statementSystemPrompt(): string {
  return `You write witness statements for a fictional police-sketch game. Every suspect is entirely fictional.

You are given a canonical trait sheet. Write the statement in the voice of a civilian witness talking to a detective — first person, natural, a little rambling, concrete where the difficulty allows ("He had this crooked nose, I remember that...").

Hard rules:
- Never invent physical traits that are not on the sheet, and never contradict the sheet.
- Never mention anything covering the face.
- No names, no crimes described in detail, no violence — the witness saw a person, that is all.
- The statement must be complete sentences and must end cleanly. 60-160 words.
- The teaser is a single line summarizing the most identifying features, max 110 characters, no quotes.`;
}

export async function generateStatement(
  client: Anthropic,
  model: string,
  difficulty: Difficulty,
  traits: TraitSheet,
  costs: CostTracker,
): Promise<GeneratedStatement> {
  const userPrompt = [
    `CANONICAL TRAIT SHEET`,
    ...traitSheetLines(traits),
    ``,
    DIFFICULTY_BRIEF[difficulty],
  ].join("\n");

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: statementSystemPrompt(),
      output_config: { format: zodOutputFormat(StatementSchema) },
      messages: [
        {
          role: "user",
          content:
            attempt === 0
              ? userPrompt
              : `${userPrompt}\n\nYour previous attempt was rejected: ${lastError}. Fix that and return the full object again.`,
        },
      ],
    });
    costs.addClaude(`statement (attempt ${attempt + 1})`, model, response.usage);

    if (response.stop_reason === "max_tokens") {
      lastError = "output truncated";
      continue;
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      lastError = "output did not match schema";
      continue;
    }
    const problem = validateStatement(parsed);
    if (problem) {
      lastError = problem;
      continue;
    }
    return parsed;
  }
  throw new Error(`statement generation failed after retries: ${lastError}`);
}

/** Belt-and-suspenders completeness checks beyond the schema. */
function validateStatement(gen: GeneratedStatement): string | null {
  const words = gen.statement.trim().split(/\s+/).length;
  if (words < 40) return `statement too short (${words} words)`;
  if (words > 220) return `statement too long (${words} words)`;
  if (!/[.!?"]$/.test(gen.statement.trim()))
    return "statement does not end with terminal punctuation (possible truncation)";
  const teaser = gen.statement_teaser.trim();
  if (teaser.length === 0 || teaser.length > 130)
    return `teaser length out of range (${teaser.length})`;
  if (/\n/.test(teaser)) return "teaser is not a single line";
  return null;
}