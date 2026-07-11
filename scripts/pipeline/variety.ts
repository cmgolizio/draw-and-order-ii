/**
 * Cross-suspect variety check (polish plan Phase 2, task 6): flag
 * near-duplicate statement openings or teasers across a batch so a human can
 * review them. Flags, never failures — rejection stays a review-CLI decision.
 *
 * Comparison is pronoun-blind ("I saw him by the door" vs "I saw her by the
 * door" is a duplicate opening), so it also holds across the sex split.
 */

export type StatementRecord = {
  id: string;
  statement: string;
  teaser: string;
};

export type VarietyFlag = {
  kind: "duplicate-opening" | "similar-opening" | "similar-teaser";
  a: string;
  b: string;
  detail: string;
};

/** How many leading words count as "the opening" for similarity purposes. */
export const OPENING_WORD_COUNT = 10;
/** Two openings sharing this many leading words are outright duplicates. */
const DUPLICATE_PREFIX_WORDS = 5;
/** Jaccard thresholds; teasers share trait vocabulary so theirs sits higher. */
const OPENING_SIMILARITY = 0.6;
const TEASER_SIMILARITY = 0.7;

/** Person-words collapse to one token so phrasing templates compare equal
 *  regardless of the suspect's sex ("the guy" ~ "the lady", "him" ~ "her"). */
const PERSON_TOKENS = new Set([
  "he",
  "she",
  "him",
  "his",
  "her",
  "hers",
  "himself",
  "herself",
  "man",
  "woman",
  "guy",
  "lady",
  "gal",
  "fella",
  "fellow",
  "gentleman",
]);

/** Lowercased, punctuation-stripped tokens with person-words collapsed. */
export function comparableTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => (PERSON_TOKENS.has(token) ? "<p>" : token));
}

/** The raw (human-readable) opening — used in prompts and flag details. */
export function rawOpening(statement: string, words = 12): string {
  return statement.trim().split(/\s+/).slice(0, words).join(" ");
}

export function openingTokens(
  statement: string,
  words = OPENING_WORD_COUNT,
): string[] {
  return comparableTokens(statement).slice(0, words);
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/** True when two statements open the same way — shared leading words or a
 *  high token overlap across the first OPENING_WORD_COUNT words. Used both by
 *  the batch check below and by statement validation's avoid-openings rule. */
export function openingsCollide(a: string, b: string): boolean {
  const tokensA = openingTokens(a);
  const tokensB = openingTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const prefixA = tokensA.slice(0, DUPLICATE_PREFIX_WORDS).join(" ");
  const prefixB = tokensB.slice(0, DUPLICATE_PREFIX_WORDS).join(" ");
  if (prefixA === prefixB) return true;
  return jaccard(tokensA, tokensB) >= OPENING_SIMILARITY;
}

/** Pairwise scan of a batch; every flag names both suspects for review. */
export function checkBatchVariety(items: StatementRecord[]): VarietyFlag[] {
  const flags: VarietyFlag[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];

      const openA = openingTokens(a.statement);
      const openB = openingTokens(b.statement);
      const samePrefix =
        openA.slice(0, DUPLICATE_PREFIX_WORDS).join(" ") ===
          openB.slice(0, DUPLICATE_PREFIX_WORDS).join(" ") &&
        openA.length > 0;
      if (samePrefix) {
        flags.push({
          kind: "duplicate-opening",
          a: a.id,
          b: b.id,
          detail: `"${rawOpening(a.statement)}…" / "${rawOpening(b.statement)}…"`,
        });
      } else if (jaccard(openA, openB) >= OPENING_SIMILARITY) {
        flags.push({
          kind: "similar-opening",
          a: a.id,
          b: b.id,
          detail: `"${rawOpening(a.statement)}…" / "${rawOpening(b.statement)}…"`,
        });
      }

      if (
        jaccard(comparableTokens(a.teaser), comparableTokens(b.teaser)) >=
        TEASER_SIMILARITY
      ) {
        flags.push({
          kind: "similar-teaser",
          a: a.id,
          b: b.id,
          detail: `"${a.teaser}" / "${b.teaser}"`,
        });
      }
    }
  }
  return flags;
}