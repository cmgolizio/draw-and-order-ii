/**
 * Anonymous identity (client, Phase 5): a uuid minted on first use, a
 * detective-style handle, and a local mirror of round history — all in
 * localStorage. Every round works with it; signing in claims it once via
 * POST /api/migrate-anon, after which the local id is retired (the server
 * burns it permanently so it can't be claimed into a second account).
 */
import type { RoundMode } from "@/lib/game/api-types";
import type { Difficulty } from "@/lib/game/trait-sheet";

const ANON_ID_KEY = "dao:anon-id";
const HANDLE_KEY = "dao:handle";
const HISTORY_KEY = "dao:history";
const HISTORY_MAX = 100;

export function getOrCreateAnonId(): string {
  const existing = peekAnonId();
  if (existing) return existing;
  const anonId = crypto.randomUUID();
  try {
    window.localStorage.setItem(ANON_ID_KEY, anonId);
  } catch {
    // Storage blocked — a per-page identity still lets this round play.
  }
  return anonId;
}

/** The stored anonId without minting one — for migration and read paths. */
export function peekAnonId(): string | null {
  try {
    const existing = window.localStorage.getItem(ANON_ID_KEY);
    return existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : null;
  } catch {
    return null;
  }
}

/** "Det. #4821" — cosmetic only; accounts get a real handle in profiles. */
export function getOrCreateLocalHandle(): string {
  try {
    const existing = window.localStorage.getItem(HANDLE_KEY);
    if (existing) return existing;
    const handle = `Det. #${Math.floor(1000 + Math.random() * 9000)}`;
    window.localStorage.setItem(HANDLE_KEY, handle);
    return handle;
  } catch {
    return "Det. #0000";
  }
}

/** One line of the local case record, mirroring the server's rounds row. */
export type LocalRound = {
  roundId: string;
  mode: RoundMode;
  difficulty: Difficulty;
  dailyDate: string | null;
  score: number | null;
  forfeited: boolean;
  createdAt: string;
};

export function readLocalHistory(): LocalRound[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LocalRound[]) : [];
  } catch {
    return [];
  }
}

export function recordLocalRound(entry: LocalRound): void {
  try {
    const rest = readLocalHistory().filter((r) => r.roundId !== entry.roundId);
    const history = [entry, ...rest].slice(0, HISTORY_MAX);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or unavailable — the mirror is never load-bearing.
  }
}

/**
 * After a claim (or on discovering the id was burned elsewhere): retire the
 * local anonymous identity so a fresh one is minted if the player ever signs
 * out and plays anonymously again. The handle stays — it's just decoration.
 */
export function clearAnonIdentity(): void {
  try {
    window.localStorage.removeItem(ANON_ID_KEY);
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nothing to clear.
  }
}