import type { NextRequest } from "next/server";
import { z } from "zod";
import type { RevealRoundResponse } from "@/lib/game/api-types";
import { apiError, withRouteErrors } from "@/lib/server/api";
import {
  identityRateKey,
  ownsRound,
  resolveIdentity,
} from "@/lib/server/identity";
import { hitLimit } from "@/lib/server/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/rounds/[id]/reveal — the give-up path (Phase 4, step 3).
 *
 * Marks the round revealed + forfeited (score stays null, so forfeits never
 * hit the leaderboard) and returns a short-lived signed suspect-image URL.
 * Idempotent for already-closed rounds: re-signs the URL so a results page
 * refresh keeps working.
 */

const REVEAL_URL_TTL_SECONDS = 600;
const REVEALS_PER_HOUR = {
  bucket: "reveal-id",
  windowSeconds: 3600,
  max: 30,
};

const BodySchema = z.object({ anonId: z.uuid().optional() });

export const POST = withRouteErrors(revealRound);

async function revealRound(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;
  if (!z.uuid().safeParse(roundId).success) {
    return apiError(400, "bad_round_id", "That case number doesn't parse.");
  }

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    // Empty body is fine — authed players don't need to send anything.
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "bad_request", "Malformed request body.");
  }

  const identity = await resolveIdentity(parsed.data.anonId);
  if (!identity) {
    return apiError(401, "identity_required", "No badge, no case file.");
  }

  const admin = createAdminClient();

  if (!(await hitLimit(admin, REVEALS_PER_HOUR, identityRateKey(identity)))) {
    return apiError(
      429,
      "rate_limited",
      "Slow down, detective — the evidence locker needs a breather.",
    );
  }

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, user_id, anon_id, suspect_id, revealed, final_score")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) {
    return apiError(500, "server_error", "Records room is jammed. Try again.");
  }
  if (!round) {
    return apiError(404, "case_file_missing", "No such case file.");
  }
  if (!ownsRound(identity, round)) {
    return apiError(403, "not_your_case", "That's not your case file, detective.");
  }

  if (!round.revealed) {
    const { error } = await admin
      .from("rounds")
      .update({ revealed: true, score_breakdown: { forfeited: true } })
      .eq("id", roundId);
    if (error) {
      return apiError(500, "server_error", "Couldn't close the case. Try again.");
    }
  }

  const { data: suspect } = await admin
    .from("suspects")
    .select("image_path")
    .eq("id", round.suspect_id)
    .maybeSingle();
  if (!suspect?.image_path) {
    return apiError(500, "case_file_corrupt", "The case file is damaged. This one's on us.");
  }
  const { data: signed } = await admin.storage
    .from("suspect-images")
    .createSignedUrl(suspect.image_path, REVEAL_URL_TTL_SECONDS);

  const response: RevealRoundResponse = {
    roundId,
    forfeited: round.final_score === null,
    suspectImageUrl: signed?.signedUrl ?? null,
  };
  return Response.json(response);
}