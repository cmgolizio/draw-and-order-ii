/**
 * Witness statement generation (Claude) — engine v2 (polish plan Phase 2).
 *
 * The statement is written FROM the trait sheet, in the voice of a rotating
 * witness persona, against a required-feature checklist per difficulty: the
 * same talking points every time, a unique voice every time. Stock openings
 * are banned outright, and the batch script passes openings already used so
 * no two suspects in a batch share one.
 *
 * Completeness and coverage are enforced: generous max_tokens, stop_reason
 * checked, schema-validated, then content-validated (banned/duplicate
 * openings, checklist coverage, pronoun agreement) — v1 shipped truncated
 * descriptions to prod because of max_tokens: 200. Two retries on validation
 * failure, then hard error.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Difficulty, DistinguishingMark, TraitSheet } from "./traits";
import { traitSheetLines } from "./traits";
import type { CostTracker } from "./costs";
import { comparableTokens, openingsCollide, openingTokens } from "./variety";

/** Bump when the prompt changes; stored in model_info per acceptance. */
export const STATEMENT_PROMPT_VERSION = "2.0.0";

const StatementSchema = z.object({
  statement: z
    .string()
    .describe("The full witness statement, first person, 60-160 words."),
  statement_teaser: z
    .string()
    .describe("One-line teaser for case cards, max 110 characters."),
});

export type GeneratedStatement = z.infer<typeof StatementSchema>;

// ---------------------------------------------------------------------------
// Personas — distinct voice, vocabulary, cadence, and (crucially) a distinct
// way of opening, so no two witnesses in a batch start the same way. Ten of
// them: a batch of ten rotates through with zero repeats.
// ---------------------------------------------------------------------------

export type WitnessPersona = {
  id: string;
  label: string;
  /** Injected verbatim into the prompt: voice, vocabulary, cadence, opening. */
  voice: string;
};

export const PERSONAS: WitnessPersona[] = [
  {
    id: "terse_hostile",
    label: "Terse hostile witness",
    voice: `You resent being here and want to leave. Clipped sentences, a few words each; you volunteer nothing warm and answer like every word costs you money. Open mid-complaint — about the wait, the coffee, having to repeat yourself — before grudgingly getting to the description.`,
  },
  {
    id: "nervous_overexplainer",
    label: "Nervous overexplainer",
    voice: `You are anxious to be helpful and terrified of getting a detail wrong. You apologize, backtrack, and correct yourself mid-sentence ("wait, no — the LEFT side"). Open with a flustered disclaimer about your nerves, then pile up detail to compensate.`,
  },
  {
    id: "cop_adjacent",
    label: "Precise cop-adjacent observer",
    voice: `Years working security taught you to give descriptions like an incident report: clinical vocabulary, distances, clock positions, no emotion. Open by logging the conditions — time of day, distance, lighting — as if reading from your notebook.`,
  },
  {
    id: "elderly_rambler",
    label: "Elderly rambler",
    voice: `You are in your eighties and in no hurry. You drift into tangents — the neighborhood, how things used to be — but the physical details you land on are needle-sharp. Open on a short tangent that has nothing to do with the suspect, then circle back to what you saw.`,
  },
  {
    id: "chatty_regular",
    label: "Chatty counter worker",
    voice: `You work a counter and read faces for a living. Warm, gossipy, running commentary; you compare the suspect's features to unnamed customers and neighbors ("same nose as the fellow who orders the lemon tea"). Open by placing the suspect against somebody you know.`,
  },
  {
    id: "reluctant_teen",
    label: "Reluctant teenager",
    voice: `You are seventeen and would rather be anywhere else. Flat delivery, filler words ("like", "I guess", "whatever"), zero enthusiasm — but the visual details you drop are oddly exact. Open with a shrugging qualifier about not really paying attention, then contradict it with specifics.`,
  },
  {
    id: "night_driver",
    label: "Night-shift driver",
    voice: `You drive nights — rides, deliveries — and you clock faces the way you check mirrors: habitually. Deadpan, unimpressed, dry asides. Open with where you were sitting or idling when the suspect crossed your headlights.`,
  },
  {
    id: "true_crime_buff",
    label: "True-crime enthusiast",
    voice: `You listen to every true-crime podcast and have waited your whole life to be a witness. Eager, self-important, jargon used slightly wrong ("I made a mental composite immediately"). Open by announcing how prepared you were for exactly this moment.`,
  },
  {
    id: "busy_parent",
    label: "Distracted parent",
    voice: `You had a toddler on one arm and groceries in the other, and your account keeps braiding domestic chaos into the description. Warm but frazzled; sentences interrupted and resumed. Open mid-scene, in the middle of whatever errand you were failing to finish.`,
  },
  {
    id: "retired_teacher",
    label: "Retired schoolteacher",
    voice: `Forty years of classrooms taught you to describe people precisely and to correct yourself when you are sloppy. Prim, complete sentences; you grade your own recollection ("that is imprecise — let me be exact"). Open by establishing your lifelong habit of noticing, the way you once watched a classroom.`,
  },
];

/**
 * Seeded persona rotation: shuffle the deck, deal it out, reshuffle when
 * empty — every persona appears once per cycle, and a cycle boundary never
 * deals the same persona twice in a row. A batch of PERSONAS.length or fewer
 * therefore gets all-distinct voices.
 */
export function createPersonaRotation(
  rng: () => number,
): () => WitnessPersona {
  let deck: WitnessPersona[] = [];
  let last: WitnessPersona | null = null;
  return () => {
    if (deck.length === 0) {
      deck = [...PERSONAS];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      // deck is consumed from the end; avoid a back-to-back repeat across
      // the cycle boundary.
      if (deck.length > 1 && deck[deck.length - 1] === last) {
        [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
      }
    }
    last = deck.pop()!;
    return last;
  };
}

// ---------------------------------------------------------------------------
// Banned openings — the stock intros v1 kept converging on. Matched
// pronoun-blind against the start of the statement, and stated as a hard rule
// in the prompt.
// ---------------------------------------------------------------------------

export const BANNED_OPENINGS = [
  "I only saw him for a moment",
  "I only saw him for a second",
  "I only got a glimpse",
  "It was over fast",
  "It was all over fast",
  "It all happened so fast",
  "It happened so fast",
  "It happened very fast",
  "I'd know him again",
  "I'd know that face anywhere",
  "I'd recognize him anywhere",
  "I'll never forget his face",
  "I'll never forget that face",
  "I got a good look at him",
  "I didn't get a good look",
  "I saw him clearly",
  "I remember it like it was yesterday",
];

/** Returns the banned phrase the statement opens with, if any. */
export function bannedOpeningViolation(statement: string): string | null {
  // 14 words of runway: the phrase counts as an "opening" even a few words in
  // ("Look, I only saw him for a moment...").
  const opening = ` ${openingTokens(statement, 14).join(" ")} `;
  for (const phrase of BANNED_OPENINGS) {
    if (opening.includes(` ${comparableTokens(phrase).join(" ")} `)) {
      return phrase;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Required-feature checklist per difficulty (replaces v1's "cover 8-10
// features"). The same structure drives both the prompt brief and the
// post-generation coverage validation, so coverage is deterministic.
// ---------------------------------------------------------------------------

export type ChecklistFeature =
  | "eyes"
  | "eyebrows"
  | "nose"
  | "mouth"
  | "faceShape"
  | "hair"
  | "build"
  | "complexion"
  | "age";

export const REQUIRED_FEATURES: Record<Difficulty, ChecklistFeature[]> = {
  rookie: [
    "eyes",
    "eyebrows",
    "nose",
    "mouth",
    "faceShape",
    "hair",
    "build",
    "complexion",
  ],
  detective: ["hair", "eyes", "nose", "faceShape", "build"],
  cold_case: ["build", "hair", "age"],
};

/** Marks required on top of the feature list: rookie names every mark,
 *  detective the first, cold_case none. */
export function requiredMarks(
  difficulty: Difficulty,
  traits: TraitSheet,
): DistinguishingMark[] {
  if (difficulty === "rookie") return traits.distinguishingMarks;
  if (difficulty === "detective") return traits.distinguishingMarks.slice(0, 1);
  return [];
}

const FEATURE_LABEL: Record<ChecklistFeature, string> = {
  eyes: "eyes",
  eyebrows: "eyebrows",
  nose: "nose",
  mouth: "mouth",
  faceShape: "face shape",
  hair: "hair",
  build: "build",
  complexion: "complexion",
  age: "age",
};

/** Ways a witness names the feature itself, without echoing the sheet's
 *  wording — a lenient guard against wholesale omission, not a grader.
 *  Shared with the Q&A validator (qa.ts). */
export const FEATURE_LABEL_PATTERNS: Record<ChecklistFeature, RegExp> = {
  eyes: /\beyes?\b/,
  eyebrows: /\b(?:eye)?brows?\b/,
  nose: /\bnose\b|\bnostrils?\b/,
  mouth: /\bmouth\b|\blips?\b|\blipped\b|\bsmile\b|\bsmirk\b/,
  faceShape:
    /\bjaw\b|\bjawed\b|\bjawline\b|\bchin\b|\bcheekbones?\b|\bcheeked\b|\bface shape\b|\bshaped? face\b/,
  hair: /\bhair\b|\bhaired\b|\bbald\b|\bshaved head\b|\bscalp\b|\bponytail\b|\bbun\b|\bcurls?\b|\bbangs\b/,
  build:
    /\bbuild\b|\bbuilt\b|\bframe\b|\bfigure\b|\bshoulders?\b|\bshouldered\b/,
  complexion: /\bcomplexion\b|\bskin\b|\bfreckl\w*\b|\bpale\b|\btanned?\b/,
  age: /\bage\b|\byoung(?:er|ish)?\b|\bold(?:er|ish)?\b|\bmiddle[- ]aged\b|\b[2-6]0s\b|\btwent(?:y|ies)\b|\bthirt(?:y|ies)\b|\bfort(?:y|ies)\b|\bfift(?:y|ies)\b|\bsixt(?:y|ies)\b/,
};

const VALUE_STOPWORDS = new Set([
  "and",
  "the",
  "with",
  "from",
  "at",
  "in",
  "on",
  "of",
  "a",
  "an",
  "its",
  "one",
  "nearly",
  "very",
]);

/** Light suffix strip so "graying"/"gray" and "jawed"/"jaw" compare equal. */
function stem(token: string): string {
  return token.length > 4 ? token.replace(/(?:ing|ed|s)$/, "") : token;
}

export function valueTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !VALUE_STOPWORDS.has(t))
    .map(stem);
}

export function statementTokens(statement: string): string[] {
  return comparableTokens(statement).map(stem);
}

export function tokenMatches(stmtToken: string, valToken: string): boolean {
  if (stmtToken === valToken) return true;
  // Prefix leniency only for longer tokens ("heavy" ~ "heavyset"), never for
  // short ones ("ear" must not match "early").
  if (valToken.length >= 4 && stmtToken.startsWith(valToken)) return true;
  if (stmtToken.length >= 4 && valToken.startsWith(stmtToken)) return true;
  return false;
}

function featureMentioned(
  feature: ChecklistFeature,
  traits: TraitSheet,
  statementText: string,
  tokens: string[],
): boolean {
  if (FEATURE_LABEL_PATTERNS[feature].test(statementText)) return true;
  const value = traits[feature];
  return valueTokens(value).some((valToken) =>
    tokens.some((stmtToken) => tokenMatches(stmtToken, valToken)),
  );
}

export function markMentioned(mark: DistinguishingMark, tokens: string[]): boolean {
  // The distinctive noun is what matters ("scar", "mole", "tattoo"...);
  // exact match after stemming so "ear" never rides along inside "early".
  const nouns = mark.mark
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stem);
  const noun = nouns[nouns.length - 1];
  return tokens.includes(noun);
}

/**
 * The checklist features (and required marks) the statement fails to
 * mention. Empty array = full coverage. Exported for the acceptance check:
 * every rookie statement must return [] here.
 */
export function missingChecklistFeatures(
  statement: string,
  traits: TraitSheet,
  difficulty: Difficulty,
): string[] {
  const text = statement.toLowerCase();
  const tokens = statementTokens(statement);
  const missing: string[] = REQUIRED_FEATURES[difficulty]
    .filter((feature) => !featureMentioned(feature, traits, text, tokens))
    .map((feature) => FEATURE_LABEL[feature]);
  for (const mark of requiredMarks(difficulty, traits)) {
    if (!markMentioned(mark, tokens)) {
      missing.push(`mark (${mark.mark} ${mark.placement})`);
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

export function statementSystemPrompt(): string {
  return `You write witness statements for a fictional police-sketch game. Every suspect is entirely fictional.

You are given a canonical trait sheet, a witness persona, and a required-feature checklist. Write the statement in the persona's voice — first person, talking to a detective, natural for that person.

Hard rules:
- Stay in the persona's voice: its vocabulary, cadence, and its way of opening. The persona changes how things are said, never what is true.
- Never invent physical traits that are not on the sheet, and never contradict the sheet.
- Use the pronouns matching the sheet's sex line (he/him or she/her), consistently.
- Never mention anything covering the face.
- The witness does not know the suspect: no names for the suspect, no crimes described in detail, no violence — the witness saw a person, that is all.
- BANNED OPENINGS. Never open the statement with any of these lines or a close paraphrase of them (any pronoun):
${BANNED_OPENINGS.map((phrase) => `    - "${phrase}"`).join("\n")}
  More generally: do not open by remarking on how briefly or how clearly you saw the suspect. Open the way the persona opens.
- The statement must be complete sentences and must end cleanly. 60-160 words.
- The teaser is plain case-file copy, NOT in the persona's voice: a single line summarizing the most identifying features, max 110 characters, no quotes.`;
}

function pronounBrief(traits: TraitSheet): string {
  return traits.sex === "female"
    ? "The suspect is a woman — use she/her throughout."
    : "The suspect is a man — use he/him throughout.";
}

/** The per-difficulty brief, built from the same checklist the validator
 *  asserts against — explicit feature-by-feature so coverage is
 *  deterministic across suspects. */
export function difficultyBrief(
  difficulty: Difficulty,
  traits: TraitSheet,
): string {
  const checklist = REQUIRED_FEATURES[difficulty]
    .map((f) => `  - ${FEATURE_LABEL[f]}: ${traits[f]}`)
    .join("\n");
  const marks = requiredMarks(difficulty, traits);
  const markLines = marks
    .map((m) => `  - distinguishing mark: ${m.mark} ${m.placement}`)
    .join("\n");

  switch (difficulty) {
    case "rookie":
      return `Target detail level: ROOKIE. The witness got a long, clear look under good light.
REQUIRED-FEATURE CHECKLIST — every single item below MUST appear in the statement, concrete and confident, no hedging:
${checklist}${markLines ? `\n${markLines} (state the placement precisely)` : ""}
You may additionally mention the sheet's age, facial hair, expression, or accessories, but the checklist comes first and none of it may be dropped.`;
    case "detective":
      return `Target detail level: DETECTIVE. The witness saw the suspect briefly under decent light.
REQUIRED-FEATURE CHECKLIST — cover exactly these items and OMIT every other physical feature on the sheet:
${checklist}${markLines ? `\n${markLines}` : ""}
Hedge one or two of them ("maybe", "I think it was...") and keep the rest confident.`;
    case "cold_case":
      return `Target detail level: COLD CASE. It was dark, or long ago — the memory is thin.
REQUIRED-FEATURE CHECKLIST — cover these three, in vague terms only:
${checklist}
You may add at most ONE more hazy physical impression from the sheet; omit everything else. Heavy hedging throughout.
Also include exactly one subjective, red-herring-ish remark that is NOT a physical trait (e.g. "looked like someone who owed money", "something off about the walk"). It must not contradict the sheet.`;
  }
}

// ---------------------------------------------------------------------------
// Generation + validation
// ---------------------------------------------------------------------------

export async function generateStatement(
  client: Anthropic,
  model: string,
  difficulty: Difficulty,
  traits: TraitSheet,
  persona: WitnessPersona,
  costs: CostTracker,
  avoidOpenings: string[] = [],
): Promise<GeneratedStatement> {
  const userPrompt = [
    `CANONICAL TRAIT SHEET`,
    ...traitSheetLines(traits),
    ``,
    `WITNESS PERSONA — ${persona.label}`,
    persona.voice,
    ``,
    pronounBrief(traits),
    ``,
    difficultyBrief(difficulty, traits),
    ...(avoidOpenings.length
      ? [
          ``,
          `OPENINGS ALREADY USED by other witnesses in this batch — your opening must not resemble any of these:`,
          ...avoidOpenings.map((o) => `  - "${o}..."`),
        ]
      : []),
  ].join("\n");

  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
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
    const problem = validateGeneratedStatement(
      parsed,
      traits,
      difficulty,
      avoidOpenings,
    );
    if (problem) {
      lastError = problem;
      continue;
    }
    return parsed;
  }
  throw new Error(`statement generation failed after retries: ${lastError}`);
}

/**
 * Belt-and-suspenders content checks beyond the schema: completeness,
 * banned/duplicate openings, checklist coverage, pronoun agreement.
 * Returns a problem description, or null when the statement passes.
 */
export function validateGeneratedStatement(
  gen: GeneratedStatement,
  traits: TraitSheet,
  difficulty: Difficulty,
  avoidOpenings: string[] = [],
): string | null {
  const statement = gen.statement.trim();
  const words = statement.split(/\s+/).length;
  if (words < 40) return `statement too short (${words} words)`;
  if (words > 220) return `statement too long (${words} words)`;
  if (!/[.!?"]$/.test(statement))
    return "statement does not end with terminal punctuation (possible truncation)";

  const teaser = gen.statement_teaser.trim();
  if (teaser.length === 0 || teaser.length > 130)
    return `teaser length out of range (${teaser.length})`;
  if (/\n/.test(teaser)) return "teaser is not a single line";

  const banned = bannedOpeningViolation(statement);
  if (banned) return `statement opens with a banned stock line ("${banned}")`;

  const collision = avoidOpenings.find((used) =>
    openingsCollide(statement, used),
  );
  if (collision)
    return `statement opening duplicates one already used in this batch ("${collision}...")`;

  const missing = missingChecklistFeatures(statement, traits, difficulty);
  if (missing.length)
    return `statement misses required checklist features: ${missing.join(", ")}`;

  const pronouns =
    traits.sex === "female" ? /\b(?:she|her|hers)\b/i : /\b(?:he|him|his)\b/i;
  if (!pronouns.test(statement))
    return `statement never refers to the ${traits.sex} suspect with ${
      traits.sex === "female" ? "she/her" : "he/him"
    } pronouns`;

  return null;
}