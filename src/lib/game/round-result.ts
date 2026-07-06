/**
 * The durable round result (Phase 7): what /results/[roundId] renders and the
 * OG share card draws from. Types only — safe to import from client code;
 * the server-side fetch lives in @/lib/server/rounds.
 */
import type { StrokeLog } from "@/lib/draw/strokeLog";
import type { ScoreBreakdownPayload, RoundMode } from "./api-types";
import type { TraitKey } from "./scoring";
import type { Difficulty } from "./trait-sheet";

export type RoundResult = {
  roundId: string;
  mode: RoundMode;
  dailyDate: string | null;
  difficulty: Difficulty;
  statement: string;
  statementTeaser: string;
  /** Filing detective — profile handle, or the anon fallback handle. */
  handle: string;
  forfeited: boolean;
  score: number | null;
  breakdown: ScoreBreakdownPayload | null;
  /** Short-lived signed URLs, minted per page render. */
  suspectImageUrl: string | null;
  drawingUrl: string | null;
  strokeLog: StrokeLog | null;
  durationSeconds: number | null;
  createdAt: string;
};

/** A revealed round is visible to anyone holding the (unguessable) link. */
export type RoundLookup =
  | { state: "missing" }
  | { state: "sealed" }
  | { state: "revealed"; result: RoundResult };

export const TRAIT_LABELS: Record<TraitKey, string> = {
  faceShape: "Face shape",
  proportions: "Proportions",
  hairStyle: "Hair",
  eyebrows: "Eyebrows",
  eyes: "Eyes",
  nose: "Nose",
  mouth: "Mouth",
  distinctiveMarks: "Distinctive marks",
};

/** Short lowercase names for the Wordle-style share line. */
export const TRAIT_SHARE_NAMES: Record<TraitKey, string> = {
  faceShape: "face shape",
  proportions: "proportions",
  hairStyle: "hair",
  eyebrows: "brows",
  eyes: "eyes",
  nose: "nose",
  mouth: "mouth",
  distinctiveMarks: "marks",
};

/** Daily rounds get the APB case number; practice cases use the file id. */
export function caseNumber(result: Pick<RoundResult, "roundId" | "dailyDate">): string {
  if (result.dailyDate) return `#${result.dailyDate.replaceAll("-", "")}`;
  return `#${result.roundId.slice(0, 8).toUpperCase()}`;
}

export function formatScore(score: number): string {
  return `${Math.round(score * 10) / 10}`;
}

/**
 * The copyable share block:
 * `Draw & Order — Case #20260702 🕵️ 78/100 · Best: nose · Miss: hairline · <url>`
 */
export function buildShareText(result: RoundResult, url: string): string {
  const head = `Draw & Order — Case ${caseNumber(result)}`;
  const badge =
    result.score !== null
      ? `🕵️ ${formatScore(result.score)}/100`
      : "🕵️ case forfeited";
  const tail: string[] = [];
  if (result.score !== null && result.breakdown) {
    tail.push(`Best: ${TRAIT_SHARE_NAMES[result.breakdown.bestFeature]}`);
    tail.push(`Miss: ${TRAIT_SHARE_NAMES[result.breakdown.biggestMiss]}`);
  }
  tail.push(url);
  return `${head} ${badge} · ${tail.join(" · ")}`;
}