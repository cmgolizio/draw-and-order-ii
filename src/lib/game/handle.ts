/**
 * Detective handle rules (Phase 5), shared by the client editor (fast
 * feedback) and POST /api/profile (authoritative — the client filter is a
 * courtesy, the server one is the law). The profanity check normalizes
 * leet-speak and separators before matching a small blocklist; the goal is
 * keeping obvious slurs off a public leaderboard, not perfection. Entries
 * are chosen to have few false-positive substrings in ordinary names.
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 24;

const HANDLE_PATTERN = /^[a-zA-Z0-9 .#'-]+$/;

const BLOCKLIST = [
  "fuck",
  "shit",
  "cunt",
  "bitch",
  "asshole",
  "dickhead",
  "cocksuck",
  "pussy",
  "twat",
  "wanker",
  "whore",
  "slut",
  "nigger",
  "nigga",
  "faggot",
  "kike",
  "spic",
  "chink",
  "wetback",
  "tranny",
  "retard",
  "rapist",
  "hitler",
  "nazi",
];

const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
};

/** Lowercase, de-leet, and strip everything but letters before matching. */
function normalized(handle: string): string {
  return handle
    .toLowerCase()
    .split("")
    .map((ch) => LEET_MAP[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; code: "format" | "profanity"; message: string };

export function checkHandle(raw: string): HandleCheck {
  const handle = raw.trim().replace(/\s+/g, " ");
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH
  ) {
    return {
      ok: false,
      code: "format",
      message: `Handles run ${HANDLE_MIN_LENGTH}–${HANDLE_MAX_LENGTH} characters.`,
    };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return {
      ok: false,
      code: "format",
      message: "Letters, digits, spaces, and . # ' - only.",
    };
  }
  const flat = normalized(handle);
  if (BLOCKLIST.some((word) => flat.includes(word))) {
    return {
      ok: false,
      code: "profanity",
      message: "That name won't fly on a precinct roster. Pick another.",
    };
  }
  return { ok: true, handle };
}