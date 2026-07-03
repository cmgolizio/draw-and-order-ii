/**
 * Request/response shapes for the game API (Phase 4), shared by the route
 * handlers and the client. Types only — no server imports.
 */
import type { TraitKey, TraitScores } from "./scoring";
import type { Difficulty } from "./trait-sheet";

export type RoundMode = "practice" | "daily";

/** POST /api/rounds — note: NO suspect image URL. Ever. */
export type CreateRoundResponse = {
  roundId: string;
  mode: RoundMode;
  dailyDate: string | null;
  difficulty: Difficulty;
  statement: string;
  statementTeaser: string;
  silhouetteUrl: string | null;
};

export type ScoreBreakdownPayload = {
  traits: TraitScores;
  caseReport: string;
  bestFeature: TraitKey;
  biggestMiss: TraitKey;
  usedGuide: boolean;
  weightedBase: number;
  multipliers: { difficulty: number; guide: number };
};

/** POST /api/rounds/[id]/submit — submission = reveal; the round is over. */
export type SubmitRoundResponse = {
  roundId: string;
  score: number;
  breakdown: ScoreBreakdownPayload;
  /** Short-lived signed URL; null only if signing failed after scoring. */
  suspectImageUrl: string | null;
  durationSeconds: number;
};

/** POST /api/rounds/[id]/reveal — the give-up path. */
export type RevealRoundResponse = {
  roundId: string;
  forfeited: boolean;
  suspectImageUrl: string | null;
};

export type ApiErrorBody = { code: string; error: string };

/** What the draw flow stashes in sessionStorage for /results/[roundId]. */
export type RoundResultPayload = {
  roundId: string;
  mode: RoundMode;
  difficulty: Difficulty;
  statement: string;
  forfeited: boolean;
  score: number | null;
  breakdown: ScoreBreakdownPayload | null;
  suspectImageUrl: string | null;
  drawingDataUrl: string | null;
  durationSeconds: number | null;
};

export const RESULT_STORAGE_PREFIX = "dao:result:";