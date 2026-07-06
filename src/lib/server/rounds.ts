import "server-only";
import { cache } from "react";
import { z } from "zod";
import { parseStrokeLog } from "@/lib/draw/strokeLog";
import type { ScoreBreakdownPayload } from "@/lib/game/api-types";
import type { RoundLookup, RoundResult } from "@/lib/game/round-result";
import { TRAIT_KEYS } from "@/lib/game/scoring";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Durable results lookup (Phase 7). A round id is an unguessable uuid, so a
 * REVEALED round acts as its own share capability: anyone holding the link
 * sees the report (that is the point of sharing it). Unrevealed rounds stay
 * sealed — the suspect image is never signed before reveal.
 */

const SIGNED_URL_TTL_SECONDS = 600;

const BreakdownSchema = z.object({
  traits: z.object(
    Object.fromEntries(TRAIT_KEYS.map((k) => [k, z.number()])) as Record<
      (typeof TRAIT_KEYS)[number],
      z.ZodNumber
    >,
  ),
  caseReport: z.string(),
  bestFeature: z.enum(TRAIT_KEYS),
  biggestMiss: z.enum(TRAIT_KEYS),
  usedGuide: z.boolean(),
  weightedBase: z.number(),
  multipliers: z.object({ difficulty: z.number(), guide: z.number() }),
});

function parseBreakdown(value: unknown): ScoreBreakdownPayload | null {
  const parsed = BreakdownSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Same convention as the daily_leaderboard RPC. */
function anonHandle(anonId: string): string {
  return `Unknown Detective #${anonId.slice(-4).toUpperCase()}`;
}

export const getRoundResult = cache(
  async (roundId: string): Promise<RoundLookup> => {
    if (!z.uuid().safeParse(roundId).success) return { state: "missing" };

    const admin = createAdminClient();

    const { data: round, error: roundError } = await admin
      .from("rounds")
      .select(
        "id, user_id, anon_id, suspect_id, mode, daily_date, drawing_path, stroke_data, final_score, score_breakdown, duration_seconds, revealed, created_at",
      )
      .eq("id", roundId)
      .maybeSingle();
    if (roundError) {
      throw new Error(`round lookup failed: ${roundError.message}`);
    }
    if (!round) return { state: "missing" };
    if (!round.revealed) return { state: "sealed" };

    const { data: suspect, error: suspectError } = await admin
      .from("suspects")
      .select("statement, statement_teaser, difficulty, image_path")
      .eq("id", round.suspect_id)
      .maybeSingle();
    if (suspectError || !suspect) {
      throw new Error("suspect lookup failed for revealed round");
    }

    let handle: string | null = null;
    if (round.user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("handle")
        .eq("id", round.user_id)
        .maybeSingle();
      handle = profile?.handle ?? null;
    }

    const [suspectSigned, drawingSigned] = await Promise.all([
      suspect.image_path
        ? admin.storage
            .from("suspect-images")
            .createSignedUrl(suspect.image_path, SIGNED_URL_TTL_SECONDS)
        : Promise.resolve(null),
      round.drawing_path
        ? admin.storage
            .from("drawings")
            .createSignedUrl(round.drawing_path, SIGNED_URL_TTL_SECONDS)
        : Promise.resolve(null),
    ]);

    const forfeited = round.final_score === null;
    const result: RoundResult = {
      roundId: round.id,
      mode: round.mode,
      dailyDate: round.daily_date,
      difficulty: suspect.difficulty,
      statement: suspect.statement,
      statementTeaser: suspect.statement_teaser,
      handle:
        handle ?? (round.anon_id ? anonHandle(round.anon_id) : "Det. Unknown"),
      forfeited,
      score: round.final_score === null ? null : Number(round.final_score),
      breakdown: forfeited ? null : parseBreakdown(round.score_breakdown),
      suspectImageUrl: suspectSigned?.data?.signedUrl ?? null,
      drawingUrl: drawingSigned?.data?.signedUrl ?? null,
      strokeLog: parseStrokeLog(round.stroke_data),
      durationSeconds: round.duration_seconds,
      createdAt: round.created_at,
    };
    return { state: "revealed", result };
  },
);

/**
 * Raw image bytes for the OG card — service role only, revealed rounds only.
 * Returns null for anything it can't produce; the card falls back gracefully.
 */
export async function downloadRoundImages(roundId: string): Promise<{
  suspectPng: ArrayBuffer | null;
  drawingPng: ArrayBuffer | null;
} | null> {
  if (!z.uuid().safeParse(roundId).success) return null;
  const admin = createAdminClient();

  const { data: round } = await admin
    .from("rounds")
    .select("suspect_id, drawing_path, revealed")
    .eq("id", roundId)
    .maybeSingle();
  if (!round?.revealed) return null;

  const { data: suspect } = await admin
    .from("suspects")
    .select("image_path")
    .eq("id", round.suspect_id)
    .maybeSingle();

  const [suspectBlob, drawingBlob] = await Promise.all([
    suspect?.image_path
      ? admin.storage.from("suspect-images").download(suspect.image_path)
      : Promise.resolve(null),
    round.drawing_path
      ? admin.storage.from("drawings").download(round.drawing_path)
      : Promise.resolve(null),
  ]);

  return {
    suspectPng: suspectBlob?.data
      ? await suspectBlob.data.arrayBuffer()
      : null,
    drawingPng: drawingBlob?.data
      ? await drawingBlob.data.arrayBuffer()
      : null,
  };
}