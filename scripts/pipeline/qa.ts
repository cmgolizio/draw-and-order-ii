/**
 * Witness Q&A bank generation (polish plan Phase 3).
 *
 * Every suspect carries a precomputed interrogation: a FIXED question set —
 * one per major trait, identical across suspects so the app can render a
 * stable list — answered in the voice of the same witness persona that gave
 * the statement, derived strictly from the trait sheet. Generated in the
 * pipeline and stored on the suspect row; the live app never generates
 * answers (preserved invariant).
 *
 * Unlike the statement, the bank is difficulty-blind: the full answer set is
 * stored for every suspect. Difficulty bites later, as the per-round question
 * budget (Phase 5) — asking is rationed, answering is not.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TraitSheet } from "./traits";
import { traitSheetLines } from "./traits";
import type { CostTracker } from "./costs";
import type { WitnessPersona } from "./statement";
import {
  FEATURE_LABEL_PATTERNS,
  markMentioned,
  statementTokens,
  tokenMatches,
  valueTokens,
} from "./statement";

/** Bump when the prompt changes; stored in model_info per acceptance. */
export const QA_PROMPT_VERSION = "1.0.0";

/** The major traits a player can interrogate. `marks` covers the whole
 *  distinguishingMarks array; every other key maps 1:1 to a sheet field. */
export const QA_TRAITS = [
  "age",
  "build",
  "hair",
  "faceShape",
  "eyes",
  "nose",
  "mouth",
  "marks",
] as const;
export type QaTrait = (typeof QA_TRAITS)[number];

/**
 * THE question set — the detective's side of the interrogation. Locked
 * decision: identical across suspects, so wording is pronoun-neutral (the
 * detective doesn't presume) and never references a specific sheet value.
 * The app renders this list verbatim; reordering or rewording is a content
 * change for ALL suspects and deserves a QA_PROMPT_VERSION bump.
 */
export const QA_QUESTIONS: readonly { trait: QaTrait; question: string }[] = [
  { trait: "age", question: "How old would you say they were?" },
  { trait: "build", question: "What kind of build did they have?" },
  { trait: "hair", question: "Tell me about the hair." },
  { trait: "faceShape", question: "What about the shape of the face?" },
  { trait: "eyes", question: "What do you remember about the eyes?" },
  { trait: "nose", question: "And the nose?" },
  { trait: "mouth", question: "Anything about the mouth?" },
  { trait: "marks", question: "Any scars, marks, or tattoos you noticed?" },
];

/** One stored row of suspects.qa_bank. */
export type QaBankEntry = {
  trait: QaTrait;
  question: string;
  answer: string;
};
export type QaBank = QaBankEntry[];

const answerField = (about: string) =>
  z
    .string()
    .describe(
      `The witness's spoken answer about the suspect's ${about}, in persona voice.`,
    );

const QaAnswersSchema = z.object({
  age: answerField("age"),
  build: answerField("build"),
  hair: answerField("hair"),
  faceShape: answerField("face shape"),
  eyes: answerField("eyes"),
  nose: answerField("nose"),
  mouth: answerField("mouth"),
  marks: answerField("distinguishing marks (scars, moles, tattoos)"),
});
export type QaAnswers = z.infer<typeof QaAnswersSchema>;

/**
 * Assemble the stored bank from per-trait answers, in QA_QUESTIONS order.
 * The seed fixtures build their banks through this too, so the question
 * wording can never drift per suspect.
 */
export function buildQaBank(answers: QaAnswers): QaBank {
  return QA_QUESTIONS.map(({ trait, question }) => ({
    trait,
    question,
    answer: answers[trait],
  }));
}

/** What the sheet says for a Q&A trait, for the prompt and error messages. */
function sheetValue(trait: QaTrait, traits: TraitSheet): string {
  if (trait === "marks") {
    return traits.distinguishingMarks.length
      ? traits.distinguishingMarks
          .map((m) => `${m.mark} ${m.placement}`)
          .join("; ")
      : "none";
  }
  return traits[trait];
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

export function qaSystemPrompt(): string {
  return `You answer a detective's interrogation questions for a fictional police-sketch game. Every suspect is entirely fictional.

You are given a canonical trait sheet, a witness persona, and the detective's fixed question list. Answer every question as the witness — first person, spoken register, an interview transcript answer rather than case-file prose.

Hard rules:
- Stay in the persona's voice, but keep each answer SHORT: one to three sentences, roughly 5-45 words. The persona changes how things are said, never what is true.
- Every answer must actually convey the sheet's value for its trait, concrete and specific. Flavor and hedging are welcome on top of the information, never instead of it.
- Never invent physical traits that are not on the sheet, and never contradict the sheet.
- Use the pronouns matching the sheet's sex line (he/him or she/her), consistently.
- If the sheet lists no distinguishing marks, the marks answer says you didn't notice any — do not invent one.
- For the marks question, name every mark on the sheet and where it sits.
- Never mention anything covering the face.`;
}

function pronounBrief(traits: TraitSheet): string {
  return traits.sex === "female"
    ? "The suspect is a woman — use she/her throughout."
    : "The suspect is a man — use he/him throughout.";
}

function questionBrief(traits: TraitSheet): string {
  return [
    `THE DETECTIVE'S QUESTIONS — answer each one; the sheet value your answer must convey follows in parentheses:`,
    ...QA_QUESTIONS.map(
      ({ trait, question }) =>
        `  - ${trait}: "${question}" (sheet: ${sheetValue(trait, traits)})`,
    ),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Generation + validation
// ---------------------------------------------------------------------------

export async function generateQaBank(
  client: Anthropic,
  model: string,
  traits: TraitSheet,
  persona: WitnessPersona,
  costs: CostTracker,
): Promise<QaBank> {
  const userPrompt = [
    `CANONICAL TRAIT SHEET`,
    ...traitSheetLines(traits),
    ``,
    `WITNESS PERSONA — ${persona.label}`,
    persona.voice,
    ``,
    pronounBrief(traits),
    ``,
    questionBrief(traits),
  ].join("\n");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: qaSystemPrompt(),
      output_config: { format: zodOutputFormat(QaAnswersSchema) },
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
    costs.addClaude(`qa bank (attempt ${attempt + 1})`, model, response.usage);

    if (response.stop_reason === "max_tokens") {
      lastError = "output truncated";
      continue;
    }
    const parsed = response.parsed_output;
    if (!parsed) {
      lastError = "output did not match schema";
      continue;
    }
    const problem = validateQaAnswers(parsed, traits);
    if (problem) {
      lastError = problem;
      continue;
    }
    return buildQaBank(parsed);
  }
  throw new Error(`qa bank generation failed after retries: ${lastError}`);
}

/**
 * Content checks beyond the schema, mirroring the statement validator's
 * leniency rules: every answer complete and in bounds, every answer carrying
 * its sheet value (an interrogation answer that names the feature but not
 * the value is an omission, so unlike the statement check, the label alone
 * does not count — age excepted, where "thirties" ~ "30s" needs the
 * pattern), every mark named, pronouns agreeing with the sheet.
 * Returns a problem description, or null when the answers pass.
 */
export function validateQaAnswers(
  answers: QaAnswers,
  traits: TraitSheet,
): string | null {
  for (const { trait } of QA_QUESTIONS) {
    const answer = answers[trait].trim();
    const words = answer.split(/\s+/).filter(Boolean).length;
    if (words < 2) return `${trait} answer too short ("${answer}")`;
    if (words > 70) return `${trait} answer too long (${words} words)`;
    if (!/[.!?"]$/.test(answer))
      return `${trait} answer does not end with terminal punctuation (possible truncation)`;

    const tokens = statementTokens(answer);
    if (trait === "marks") {
      for (const mark of traits.distinguishingMarks) {
        if (!markMentioned(mark, tokens))
          return `marks answer never mentions the ${mark.mark} ${mark.placement}`;
      }
      continue;
    }

    const valueCovered = valueTokens(traits[trait]).some((valToken) =>
      tokens.some((stmtToken) => tokenMatches(stmtToken, valToken)),
    );
    const ageCovered =
      trait === "age" && FEATURE_LABEL_PATTERNS.age.test(answer.toLowerCase());
    if (!valueCovered && !ageCovered)
      return `${trait} answer does not convey the sheet value ("${traits[trait]}")`;
  }

  const spoken = QA_QUESTIONS.map(({ trait }) => answers[trait]).join(" ");
  const pronouns =
    traits.sex === "female" ? /\b(?:she|her|hers)\b/i : /\b(?:he|him|his)\b/i;
  if (!pronouns.test(spoken))
    return `answers never refer to the ${traits.sex} suspect with ${
      traits.sex === "female" ? "she/her" : "he/him"
    } pronouns`;

  return null;
}
