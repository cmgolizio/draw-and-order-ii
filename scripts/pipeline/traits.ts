/**
 * Trait tables + roll. Ported from v1's trait system
 * (age/build/hair/facialHair/accessories/expression/complexion) and extended
 * per the build plan with face shape, eyebrow character, nose character, and
 * distinguishing marks with placement.
 *
 * v1's bandana ALL-CAPS hack is gone — "no face coverings" is a hard
 * constraint in the image prompt template instead (see image-gen.ts).
 *
 * The rolled sheet is the canonical source of truth: the statement is written
 * FROM it, the image is rendered FROM it, and Phase 4's judge scores against
 * it. It is stored verbatim in suspects.traits.
 */

export type DistinguishingMark = { mark: string; placement: string };

export type TraitSheet = {
  age: string;
  build: string;
  faceShape: string;
  hair: string;
  facialHair: string;
  eyebrows: string;
  eyes: string;
  nose: string;
  mouth: string;
  distinguishingMarks: DistinguishingMark[];
  expression: string;
  complexion: string;
  accessories: string[];
};

export type Difficulty = "rookie" | "detective" | "cold_case";
export const DIFFICULTIES: Difficulty[] = ["rookie", "detective", "cold_case"];

type Weighted<T> = { value: T; weight: number };

const AGES: Weighted<string>[] = [
  { value: "early 20s", weight: 2 },
  { value: "late 20s", weight: 3 },
  { value: "early 30s", weight: 3 },
  { value: "mid-30s", weight: 3 },
  { value: "early 40s", weight: 3 },
  { value: "mid-40s", weight: 3 },
  { value: "50s", weight: 2 },
  { value: "60s", weight: 1 },
];

const BUILDS: Weighted<string>[] = [
  { value: "slight", weight: 2 },
  { value: "lean", weight: 3 },
  { value: "average", weight: 4 },
  { value: "stocky", weight: 3 },
  { value: "broad-shouldered", weight: 2 },
  { value: "heavyset", weight: 2 },
];

const FACE_SHAPES: Weighted<string>[] = [
  { value: "round", weight: 3 },
  { value: "oval", weight: 3 },
  { value: "square, heavy-jawed", weight: 3 },
  { value: "oblong", weight: 2 },
  { value: "heart-shaped, narrow chin", weight: 2 },
  { value: "gaunt, hollow-cheeked", weight: 1 },
  { value: "wide, flat", weight: 2 },
];

const HAIR_COLORS: Weighted<string>[] = [
  { value: "dark", weight: 4 },
  { value: "black", weight: 3 },
  { value: "brown", weight: 3 },
  { value: "sandy", weight: 2 },
  { value: "red", weight: 1 },
  { value: "graying", weight: 2 },
  { value: "salt-and-pepper", weight: 2 },
  { value: "white", weight: 1 },
];

const HAIR_STYLES: Weighted<string>[] = [
  { value: "buzz cut", weight: 3 },
  { value: "short and messy", weight: 3 },
  { value: "swept back", weight: 2 },
  { value: "side part", weight: 2 },
  { value: "curly mop", weight: 2 },
  { value: "shoulder-length", weight: 1 },
  { value: "receding at the temples", weight: 2 },
  { value: "widow's peak", weight: 1 },
  { value: "tight cropped curls", weight: 2 },
];

const BALD_OPTIONS: Weighted<string>[] = [
  { value: "completely bald", weight: 2 },
  { value: "shaved head", weight: 2 },
  { value: "bald on top, short at the sides", weight: 2 },
];

const FACIAL_HAIR: Weighted<string>[] = [
  { value: "clean-shaven", weight: 5 },
  { value: "light stubble", weight: 3 },
  { value: "heavy stubble", weight: 2 },
  { value: "mustache", weight: 2 },
  { value: "goatee", weight: 2 },
  { value: "full beard, trimmed", weight: 2 },
  { value: "full beard, unkempt", weight: 1 },
  { value: "horseshoe mustache", weight: 1 },
];

const EYEBROWS: Weighted<string>[] = [
  { value: "thick and straight", weight: 3 },
  { value: "bushy, nearly meeting in the middle", weight: 2 },
  { value: "thin and arched", weight: 2 },
  { value: "sparse", weight: 2 },
  { value: "angular, sharply peaked", weight: 2 },
  { value: "heavy, low over the eyes", weight: 2 },
];

const EYES: Weighted<string>[] = [
  { value: "deep-set", weight: 3 },
  { value: "wide-set", weight: 2 },
  { value: "close-set", weight: 2 },
  { value: "heavy-lidded", weight: 2 },
  { value: "narrow", weight: 2 },
  { value: "large and round", weight: 2 },
  { value: "downturned at the corners", weight: 1 },
];

const NOSES: Weighted<string>[] = [
  { value: "flat with a wide base", weight: 2 },
  { value: "narrow and pointed", weight: 2 },
  { value: "crooked, bent left from an old break", weight: 2 },
  { value: "crooked, bent right from an old break", weight: 1 },
  { value: "bulbous", weight: 2 },
  { value: "hooked", weight: 2 },
  { value: "long and thin", weight: 2 },
  { value: "short and upturned", weight: 1 },
];

const MOUTHS: Weighted<string>[] = [
  { value: "thin-lipped", weight: 3 },
  { value: "full-lipped", weight: 2 },
  { value: "wide", weight: 2 },
  { value: "small and tight", weight: 2 },
  { value: "downturned", weight: 2 },
  { value: "crooked, one corner higher", weight: 1 },
];

const EXPRESSIONS: Weighted<string>[] = [
  { value: "flat, unreadable", weight: 3 },
  { value: "permanent squint", weight: 2 },
  { value: "scowling", weight: 2 },
  { value: "faint smirk", weight: 2 },
  { value: "tired, drawn", weight: 2 },
  { value: "alert, wary", weight: 2 },
];

const COMPLEXIONS: Weighted<string>[] = [
  { value: "pale", weight: 2 },
  { value: "fair, freckled", weight: 1 },
  { value: "ruddy", weight: 2 },
  { value: "olive", weight: 2 },
  { value: "tan, weathered", weight: 2 },
  { value: "light brown", weight: 2 },
  { value: "medium brown", weight: 2 },
  { value: "dark brown", weight: 2 },
  { value: "sallow", weight: 1 },
];

/** Nothing that covers the face — hard rule, enforced again in the prompt. */
const ACCESSORIES: Weighted<string[]>[] = [
  { value: [], weight: 8 },
  { value: ["wire-rim glasses"], weight: 2 },
  { value: ["thick black-framed glasses"], weight: 2 },
  { value: ["small hoop earring, left ear"], weight: 1 },
  { value: ["stud earring, both ears"], weight: 1 },
  { value: ["flat cap"], weight: 1 },
  { value: ["dark beanie, worn high"], weight: 1 },
];

const MARKS: Weighted<string>[] = [
  { value: "small scar", weight: 3 },
  { value: "long thin scar", weight: 2 },
  { value: "prominent mole", weight: 3 },
  { value: "dark birthmark", weight: 2 },
  { value: "faint pockmarks", weight: 2 },
  { value: "small tattoo", weight: 1 },
  { value: "cauliflower ear", weight: 1 },
];

const MARK_PLACEMENTS: Record<string, Weighted<string>[]> = {
  "small scar": [
    { value: "through the left eyebrow", weight: 2 },
    { value: "through the right eyebrow", weight: 2 },
    { value: "on the chin", weight: 2 },
    { value: "on the left cheekbone", weight: 2 },
    { value: "above the upper lip", weight: 1 },
  ],
  "long thin scar": [
    { value: "down the right cheek", weight: 2 },
    { value: "down the left cheek", weight: 2 },
    { value: "across the forehead", weight: 1 },
    { value: "along the jawline", weight: 2 },
  ],
  "prominent mole": [
    { value: "on the right cheek", weight: 2 },
    { value: "on the left cheek", weight: 2 },
    { value: "above the lip", weight: 2 },
    { value: "on the chin", weight: 1 },
    { value: "at the left temple", weight: 1 },
  ],
  "dark birthmark": [
    { value: "at the right temple", weight: 2 },
    { value: "on the neck, left side", weight: 2 },
    { value: "on the forehead", weight: 1 },
  ],
  "faint pockmarks": [
    { value: "across both cheeks", weight: 2 },
    { value: "on the lower cheeks", weight: 1 },
  ],
  "small tattoo": [
    { value: "on the neck, right side", weight: 2 },
    { value: "behind the left ear", weight: 1 },
  ],
  "cauliflower ear": [
    { value: "left ear", weight: 1 },
    { value: "right ear", weight: 1 },
  ],
};

/** Mulberry32 — tiny seeded PRNG so batches are reproducible from a seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, table: Weighted<T>[]): T {
  const total = table.reduce((sum, row) => sum + row.weight, 0);
  let roll = rng() * total;
  for (const row of table) {
    roll -= row.weight;
    if (roll <= 0) return row.value;
  }
  return table[table.length - 1].value;
}

export function rollTraits(rng: () => number): TraitSheet {
  const bald = rng() < 0.12;
  const hair = bald
    ? pick(rng, BALD_OPTIONS)
    : `${pick(rng, HAIR_COLORS)} ${pick(rng, HAIR_STYLES)}`;

  const markCount = rng() < 0.55 ? 1 : rng() < 0.2 ? 2 : 0;
  const distinguishingMarks: DistinguishingMark[] = [];
  const usedMarks = new Set<string>();
  while (distinguishingMarks.length < markCount) {
    const mark = pick(rng, MARKS);
    if (usedMarks.has(mark)) continue;
    usedMarks.add(mark);
    distinguishingMarks.push({
      mark,
      placement: pick(rng, MARK_PLACEMENTS[mark]),
    });
  }

  return {
    age: pick(rng, AGES),
    build: pick(rng, BUILDS),
    faceShape: pick(rng, FACE_SHAPES),
    hair,
    facialHair: pick(rng, FACIAL_HAIR),
    eyebrows: pick(rng, EYEBROWS),
    eyes: pick(rng, EYES),
    nose: pick(rng, NOSES),
    mouth: pick(rng, MOUTHS),
    distinguishingMarks,
    expression: pick(rng, EXPRESSIONS),
    complexion: pick(rng, COMPLEXIONS),
    accessories: pick(rng, ACCESSORIES),
  };
}

/** Flat human-readable lines, used in both prompts and the review CLI. */
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