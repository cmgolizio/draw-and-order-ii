import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { TraitSheetSchema, type TraitSheet } from "@/lib/game/trait-sheet";
import {
  buildQaBank,
  generateQaBank,
  QA_PROMPT_VERSION,
  QA_QUESTIONS,
  QA_TRAITS,
  validateQaAnswers,
  type QaAnswers,
} from "../../scripts/pipeline/qa";
import { PERSONAS } from "../../scripts/pipeline/statement";
import { CostTracker } from "../../scripts/pipeline/costs";
import { SEED_SUSPECTS } from "../../scripts/lib/seed-data";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const male: TraitSheet = {
  sex: "male",
  age: "mid-40s",
  build: "stocky",
  faceShape: "square, heavy-jawed",
  hair: "dark buzz cut",
  facialHair: "heavy stubble",
  eyebrows: "bushy, nearly meeting in the middle",
  eyes: "deep-set",
  nose: "crooked, bent left from an old break",
  mouth: "thin-lipped",
  distinguishingMarks: [
    { mark: "small scar", placement: "through the left eyebrow" },
  ],
  expression: "flat, unreadable",
  complexion: "pale",
  accessories: [],
};

const female: TraitSheet = {
  sex: "female",
  age: "early 30s",
  build: "petite",
  faceShape: "heart-shaped, narrow chin",
  hair: "black chin-length bob",
  eyebrows: "thin and arched",
  eyes: "large and round",
  nose: "short and upturned",
  mouth: "full-lipped",
  distinguishingMarks: [
    { mark: "prominent mole", placement: "above the lip" },
  ],
  expression: "alert, wary",
  complexion: "olive",
  accessories: [],
};

const goodMaleAnswers: QaAnswers = {
  age: "Forties, I'd guess. Mid-forties.",
  build: "Stocky. He was built like a door.",
  hair: "Dark. A buzz cut, close to the skull.",
  faceShape: "Square face, heavy through the jaw.",
  eyes: "Deep-set. Hard to catch the color.",
  nose: "Crooked — bent left, like it had been broken once.",
  mouth: "Thin-lipped. Barely there.",
  marks: "A small scar through his left eyebrow.",
};

const goodFemaleAnswers: QaAnswers = {
  age: "Young. Early thirties, if I had to put a number on it.",
  build: "Petite. Small-framed.",
  hair: "A black bob, cut at the chin.",
  faceShape: "Heart-shaped, with a narrow little chin.",
  eyes: "Large and round. She had wide-open eyes.",
  nose: "Short and upturned.",
  mouth: "Full lips. Full-lipped, definitely.",
  marks: "A mole above her lip. Prominent, you know.",
};

// ---------------------------------------------------------------------------
// The fixed question set
// ---------------------------------------------------------------------------

describe("QA_QUESTIONS", () => {
  it("has a version and one question per major trait, in a stable order", () => {
    expect(QA_PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(QA_QUESTIONS.map((q) => q.trait)).toEqual([...QA_TRAITS]);
    for (const { question } of QA_QUESTIONS) {
      expect(question.length).toBeGreaterThan(0);
    }
  });

  it("is pronoun-neutral so the identical wording fits every suspect", () => {
    for (const { question } of QA_QUESTIONS) {
      expect(question).not.toMatch(/\b(?:he|him|his|she|her|hers)\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Bank assembly — identical questions, suspect-specific answers
// ---------------------------------------------------------------------------

describe("buildQaBank", () => {
  it("emits identical questions for different suspects; only answers vary", () => {
    const bankA = buildQaBank(goodMaleAnswers);
    const bankB = buildQaBank(goodFemaleAnswers);
    expect(bankA.map((e) => e.question)).toEqual(bankB.map((e) => e.question));
    expect(bankA.map((e) => e.trait)).toEqual(bankB.map((e) => e.trait));
    expect(bankA.map((e) => e.answer)).not.toEqual(bankB.map((e) => e.answer));
  });

  it("preserves QA_QUESTIONS order and pairs each answer with its trait", () => {
    const bank = buildQaBank(goodMaleAnswers);
    expect(bank).toHaveLength(QA_QUESTIONS.length);
    bank.forEach((entry, i) => {
      expect(entry.trait).toBe(QA_QUESTIONS[i].trait);
      expect(entry.question).toBe(QA_QUESTIONS[i].question);
      expect(entry.answer).toBe(goodMaleAnswers[entry.trait]);
    });
  });
});

// ---------------------------------------------------------------------------
// Answer validation
// ---------------------------------------------------------------------------

describe("validateQaAnswers", () => {
  it("passes witness-voice answers that carry every sheet value", () => {
    expect(validateQaAnswers(goodMaleAnswers, male)).toBeNull();
    expect(validateQaAnswers(goodFemaleAnswers, female)).toBeNull();
  });

  it("rejects an answer that names the feature but drops the value", () => {
    const vague = {
      ...goodMaleAnswers,
      eyes: "Couldn't tell you much about them, honestly.",
    };
    expect(validateQaAnswers(vague, male)).toMatch(/eyes/);
  });

  it("rejects a marks answer that omits a sheet mark", () => {
    const forgetful = { ...goodMaleAnswers, marks: "Nothing that I noticed." };
    expect(validateQaAnswers(forgetful, male)).toMatch(/marks/);
  });

  it("accepts a no-marks denial when the sheet has no marks", () => {
    const noMarks: TraitSheet = { ...male, distinguishingMarks: [] };
    const denial = { ...goodMaleAnswers, marks: "Nothing that I noticed." };
    expect(validateQaAnswers(denial, noMarks)).toBeNull();
  });

  it("rejects one-word and unterminated answers", () => {
    expect(
      validateQaAnswers({ ...goodMaleAnswers, nose: "Crooked." }, male),
    ).toMatch(/too short/);
    expect(
      validateQaAnswers(
        { ...goodMaleAnswers, hair: "Dark buzz cut, and then he" },
        male,
      ),
    ).toMatch(/terminal punctuation/);
  });

  it("rejects a bank that never uses the sheet's pronouns", () => {
    const unsexed = {
      ...goodFemaleAnswers,
      eyes: "Large and round.",
      marks: "A mole above the lip.",
    };
    expect(validateQaAnswers(unsexed, female)).toMatch(/she\/her/);
  });
});

// ---------------------------------------------------------------------------
// Generation loop (stubbed client) — retry on bad content, costs recorded
// ---------------------------------------------------------------------------

function stubClient(outputs: Array<Partial<QaAnswers> | null>): Anthropic {
  let call = 0;
  return {
    messages: {
      parse: async () => ({
        stop_reason: "end_turn",
        parsed_output: outputs[Math.min(call++, outputs.length - 1)],
        usage: { input_tokens: 500, output_tokens: 200 },
      }),
    },
  } as unknown as Anthropic;
}

describe("generateQaBank", () => {
  it("returns a full bank and logs cost per attempt", async () => {
    const costs = new CostTracker();
    const bank = await generateQaBank(
      stubClient([goodMaleAnswers]),
      "claude-opus-4-8",
      male,
      PERSONAS[0],
      costs,
    );
    expect(bank).toHaveLength(QA_QUESTIONS.length);
    expect(bank.map((e) => e.trait)).toEqual([...QA_TRAITS]);
    expect(costs.summary().entries.map((e) => e.label)).toEqual([
      "qa bank (attempt 1)",
    ]);
    expect(costs.totalUsd).toBeGreaterThan(0);
  });

  it("retries rejected content and succeeds on a fixed attempt", async () => {
    const costs = new CostTracker();
    const vague = { ...goodMaleAnswers, eyes: "Hard to say, really." };
    const bank = await generateQaBank(
      stubClient([vague, goodMaleAnswers]),
      "claude-opus-4-8",
      male,
      PERSONAS[0],
      costs,
    );
    expect(bank.find((e) => e.trait === "eyes")?.answer).toBe(
      goodMaleAnswers.eyes,
    );
    expect(costs.summary().entries).toHaveLength(2);
  });

  it("gives up after three rejected attempts", async () => {
    const vague = { ...goodMaleAnswers, eyes: "Hard to say, really." };
    await expect(
      generateQaBank(
        stubClient([vague]),
        "claude-opus-4-8",
        male,
        PERSONAS[0],
        new CostTracker(),
      ),
    ).rejects.toThrow(/failed after retries/);
  });
});

// ---------------------------------------------------------------------------
// Seed fixtures carry real banks
// ---------------------------------------------------------------------------

describe("seed suspects", () => {
  it("carry full banks that pass the same validation as pipeline output", () => {
    for (const suspect of SEED_SUSPECTS) {
      const answers = Object.fromEntries(
        suspect.qa_bank.map((e) => [e.trait, e.answer]),
      ) as QaAnswers;
      const traits = TraitSheetSchema.parse(suspect.traits);
      expect(validateQaAnswers(answers, traits)).toBeNull();
    }
  });

  it("share identical questions across both fixtures", () => {
    const [a, b] = SEED_SUSPECTS;
    expect(a.qa_bank.map((e) => e.question)).toEqual(
      b.qa_bank.map((e) => e.question),
    );
    expect(a.qa_bank.map((e) => e.question)).toEqual(
      QA_QUESTIONS.map((q) => q.question),
    );
  });
});
