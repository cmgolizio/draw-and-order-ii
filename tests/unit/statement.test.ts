import { describe, expect, it } from "vitest";
import type { TraitSheet } from "@/lib/game/trait-sheet";
import { makeRng } from "../../scripts/pipeline/traits";
import {
  BANNED_OPENINGS,
  bannedOpeningViolation,
  createPersonaRotation,
  missingChecklistFeatures,
  PERSONAS,
  REQUIRED_FEATURES,
  STATEMENT_PROMPT_VERSION,
  validateGeneratedStatement,
} from "../../scripts/pipeline/statement";
import {
  checkBatchVariety,
  openingsCollide,
  rawOpening,
} from "../../scripts/pipeline/variety";

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

/** Full-checklist rookie statement for `male` — every required feature. */
const ROOKIE_MALE_STATEMENT =
  "Sorry, I'm shaking a little — okay. He was stocky, square through the jaw, mid-forties maybe. Dark hair, a buzz cut. Deep-set eyes under bushy eyebrows, nearly meeting in the middle. His nose was crooked, bent left like an old break, and he had a thin-lipped mouth. Pale complexion — very pale. And a small scar, right through the left eyebrow. I keep seeing it.";

/** Full-checklist rookie statement for `female`. */
const ROOKIE_FEMALE_STATEMENT =
  "She came right up to the counter, so I had a while. Petite, early thirties. Black hair in a chin-length bob. Large round eyes, thin arched eyebrows. Her nose was short, a little upturned, over a full-lipped mouth — and a mole above the lip, very noticeable. Olive skin. Heart-shaped face, narrow at the chin. I'd put all of that down twice if you asked.";

/** Detective subset for `male`: hair, eyes, nose, face shape, build + mark. */
const DETECTIVE_MALE_STATEMENT =
  "Saw him outside maybe ten seconds under the streetlight. Stocky guy, heavy square jaw. Dark hair — a buzz cut, I think. Deep-set eyes. The nose was crooked, bent off to the left. And there was a small scar through his left eyebrow, I'm fairly sure about that part, more than the rest of it anyway.";

/** Cold-case trio for `male`: build, hair, age (+ red herring). */
const COLD_CASE_MALE_STATEMENT =
  "Honestly it was dark and it's been months. Big heavy sort of build, that's what stayed with me. Hair was dark, I think — could be wrong. Older than me anyway, forties, fifties maybe. The one thing I'd swear to is he moved like somebody who didn't want to be seen. That's all I've got, and half of that I'd hedge.";

const ROOKIE_MALE_TEASER =
  "Stocky mid-40s man, buzz cut, deep-set eyes, crooked nose, scar through left eyebrow.";

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

describe("personas", () => {
  it("defines at least 10 personas so a batch of 10 rotates without repeats", () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids and labels, each with a voice brief", () => {
    expect(new Set(PERSONAS.map((p) => p.id)).size).toBe(PERSONAS.length);
    expect(new Set(PERSONAS.map((p) => p.label)).size).toBe(PERSONAS.length);
    for (const persona of PERSONAS) {
      expect(persona.voice.length).toBeGreaterThan(80);
    }
  });

  it("gives every persona a distinct opening approach in its voice brief", () => {
    for (const persona of PERSONAS) {
      expect(persona.voice).toMatch(/Open /);
    }
  });
});

describe("createPersonaRotation", () => {
  it("deals all-distinct personas across a batch of 10", () => {
    const next = createPersonaRotation(makeRng(1234));
    const ids = Array.from({ length: 10 }, () => next().id);
    expect(new Set(ids).size).toBe(10);
  });

  it("is deterministic for a given seed", () => {
    const a = createPersonaRotation(makeRng(42));
    const b = createPersonaRotation(makeRng(42));
    for (let i = 0; i < 25; i++) {
      expect(a().id).toBe(b().id);
    }
  });

  it("cycles evenly and never repeats back-to-back across cycle boundaries", () => {
    const next = createPersonaRotation(makeRng(7));
    const ids = Array.from({ length: PERSONAS.length * 3 }, () => next().id);
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const persona of PERSONAS) expect(counts.get(persona.id)).toBe(3);
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).not.toBe(ids[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// Banned openings
// ---------------------------------------------------------------------------

describe("bannedOpeningViolation", () => {
  it("catches every phrase on the banned list verbatim", () => {
    for (const phrase of BANNED_OPENINGS) {
      const statement = `${phrase}, but I can tell you what I remember about the man and his face.`;
      expect(bannedOpeningViolation(statement)).toBe(phrase);
    }
  });

  it("is pronoun-blind (a her/she variant still violates)", () => {
    expect(
      bannedOpeningViolation(
        "I only saw her for a moment, but the jaw stayed with me.",
      ),
    ).toBe("I only saw him for a moment");
    expect(
      bannedOpeningViolation("I'd know her again if she walked past."),
    ).toBe("I'd know him again");
  });

  it("catches a banned phrase hiding a few words into the opening", () => {
    expect(
      bannedOpeningViolation(
        "Look, honestly, it all happened so fast that night.",
      ),
    ).toBe("It all happened so fast");
  });

  it("passes persona-shaped openings", () => {
    expect(bannedOpeningViolation(ROOKIE_MALE_STATEMENT)).toBeNull();
    expect(bannedOpeningViolation(ROOKIE_FEMALE_STATEMENT)).toBeNull();
    expect(bannedOpeningViolation(COLD_CASE_MALE_STATEMENT)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Required-feature checklist
// ---------------------------------------------------------------------------

describe("REQUIRED_FEATURES", () => {
  it("matches the polish-plan checklist per difficulty", () => {
    expect([...REQUIRED_FEATURES.rookie].sort()).toEqual(
      [
        "eyes",
        "eyebrows",
        "nose",
        "mouth",
        "faceShape",
        "hair",
        "build",
        "complexion",
      ].sort(),
    );
    expect(REQUIRED_FEATURES.detective).toHaveLength(5);
    expect(REQUIRED_FEATURES.cold_case).toHaveLength(3);
  });
});

describe("missingChecklistFeatures", () => {
  it("returns empty for a rookie statement hitting the full checklist (male)", () => {
    expect(missingChecklistFeatures(ROOKIE_MALE_STATEMENT, male, "rookie")).toEqual(
      [],
    );
  });

  it("returns empty for a rookie statement hitting the full checklist (female)", () => {
    expect(
      missingChecklistFeatures(ROOKIE_FEMALE_STATEMENT, female, "rookie"),
    ).toEqual([]);
  });

  it("flags an omitted feature", () => {
    const withoutComplexion = ROOKIE_FEMALE_STATEMENT.replace(
      " Olive skin.",
      "",
    );
    expect(
      missingChecklistFeatures(withoutComplexion, female, "rookie"),
    ).toContain("complexion");
  });

  it("flags an omitted distinguishing mark on rookie", () => {
    const withoutMole = ROOKIE_FEMALE_STATEMENT.replace(
      " — and a mole above the lip, very noticeable",
      "",
    );
    expect(missingChecklistFeatures(withoutMole, female, "rookie")).toContain(
      "mark (prominent mole above the lip)",
    );
  });

  it("accepts the detective named subset", () => {
    expect(
      missingChecklistFeatures(DETECTIVE_MALE_STATEMENT, male, "detective"),
    ).toEqual([]);
  });

  it("accepts the cold-case trio in vague terms", () => {
    expect(
      missingChecklistFeatures(COLD_CASE_MALE_STATEMENT, male, "cold_case"),
    ).toEqual([]);
  });

  it("still requires the first mark on detective", () => {
    const withoutScar = DETECTIVE_MALE_STATEMENT.replace(
      " And there was a small scar through his left eyebrow, I'm fairly sure about that part, more than the rest of it anyway.",
      " That is everything I can give you with any confidence, detective.",
    );
    expect(
      missingChecklistFeatures(withoutScar, male, "detective"),
    ).toContain("mark (small scar through the left eyebrow)");
  });
});

// ---------------------------------------------------------------------------
// Full statement validation
// ---------------------------------------------------------------------------

describe("validateGeneratedStatement", () => {
  const valid = {
    statement: ROOKIE_MALE_STATEMENT,
    statement_teaser: ROOKIE_MALE_TEASER,
  };

  it("passes a complete, covering, persona-voiced statement", () => {
    expect(validateGeneratedStatement(valid, male, "rookie")).toBeNull();
  });

  it("rejects banned openings", () => {
    const gen = {
      ...valid,
      statement: `I got a good look at him. ${ROOKIE_MALE_STATEMENT}`,
    };
    expect(validateGeneratedStatement(gen, male, "rookie")).toMatch(
      /banned stock line/,
    );
  });

  it("rejects a checklist miss", () => {
    const gen = {
      ...valid,
      statement: ROOKIE_MALE_STATEMENT.replace(
        "Pale complexion — very pale. ",
        "",
      ),
    };
    expect(validateGeneratedStatement(gen, male, "rookie")).toMatch(
      /misses required checklist features: complexion/,
    );
  });

  it("rejects wrong-pronoun statements for a female suspect", () => {
    const noFemalePronouns = ROOKIE_FEMALE_STATEMENT.replace(
      "She came right up to the counter",
      "The customer came right up to the counter",
    ).replace("Her nose", "The nose");
    const gen = {
      statement: noFemalePronouns,
      statement_teaser: "Petite woman, black bob, mole above the lip.",
    };
    expect(validateGeneratedStatement(gen, female, "rookie")).toMatch(
      /she\/her pronouns/,
    );
  });

  it("rejects an opening already used in the batch", () => {
    const gen = { ...valid };
    const usedOpening = rawOpening(ROOKIE_MALE_STATEMENT);
    expect(
      validateGeneratedStatement(gen, male, "rookie", [usedOpening]),
    ).toMatch(/duplicates one already used/);
  });

  it("still rejects truncation-shaped output", () => {
    const gen = { ...valid, statement: "He was stocky and" };
    expect(validateGeneratedStatement(gen, male, "rookie")).toMatch(
      /too short/,
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-suspect variety check
// ---------------------------------------------------------------------------

describe("checkBatchVariety", () => {
  it("flags two statements sharing an opening, pronoun-blind", () => {
    const flags = checkBatchVariety([
      {
        id: "a",
        statement:
          "I was locking up the shop when he came past me, close enough to touch, and I got the whole face.",
        teaser: "Tall man with a hooked nose and a flat cap.",
      },
      {
        id: "b",
        statement:
          "I was locking up the shop when she came past me, slower than you'd expect, hood down, no hurry at all.",
        teaser: "Short woman, gray bun, mole on the chin.",
      },
    ]);
    expect(flags.some((f) => f.kind === "duplicate-opening")).toBe(true);
  });

  it("flags near-identical teasers", () => {
    const flags = checkBatchVariety([
      {
        id: "a",
        statement: ROOKIE_MALE_STATEMENT,
        teaser:
          "Stocky man, buzz cut, deep-set eyes, crooked nose, scar through left eyebrow.",
      },
      {
        id: "b",
        statement: COLD_CASE_MALE_STATEMENT,
        teaser:
          "Stocky man, buzz cut, deep-set eyes, crooked nose, scar through right eyebrow.",
      },
    ]);
    expect(flags.some((f) => f.kind === "similar-teaser")).toBe(true);
  });

  it("stays quiet for a genuinely varied batch", () => {
    const flags = checkBatchVariety([
      {
        id: "a",
        statement: ROOKIE_MALE_STATEMENT,
        teaser: ROOKIE_MALE_TEASER,
      },
      {
        id: "b",
        statement: ROOKIE_FEMALE_STATEMENT,
        teaser: "Petite woman, black chin-length bob, mole above the lip.",
      },
      {
        id: "c",
        statement: COLD_CASE_MALE_STATEMENT,
        teaser: "Heavyset figure, dark hair, seen at night — few certainties.",
      },
    ]);
    expect(flags).toEqual([]);
  });

  it("openingsCollide backs the avoid-openings rule symmetrically", () => {
    expect(
      openingsCollide(
        "I was locking up the shop when he came past me, close enough to touch.",
        rawOpening(
          "I was locking up the shop when she came past me, slower than you'd expect.",
        ),
      ),
    ).toBe(true);
    expect(
      openingsCollide(ROOKIE_MALE_STATEMENT, rawOpening(ROOKIE_FEMALE_STATEMENT)),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

describe("STATEMENT_PROMPT_VERSION", () => {
  it("is bumped for statement engine v2", () => {
    expect(STATEMENT_PROMPT_VERSION.startsWith("2.")).toBe(true);
  });
});