import type { NextRequest } from "next/server";
import { z } from "zod";
import type { CreateRoundResponse } from "@/lib/game/api-types";
import { apiError, utcToday, withRouteErrors } from "@/lib/server/api";
import {
  ensureProfile,
  identityRateKey,
  requestIp,
  resolveIdentity,
} from "@/lib/server/identity";
import { hitLimit, LIMITS } from "@/lib/server/rate-limit";
import { verifyTurnstile } from "@/lib/server/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/rounds — opens a round (Phase 4, round lifecycle step 1).
 *
 * Server picks a random live suspect (or the daily), creates a rounds row,
 * and returns { roundId, statement, silhouetteUrl }. The suspect image URL
 * is never in this response — the client cannot see the face before reveal.
 */

const BodySchema = z.object({
  mode: z.enum(["practice", "daily"]),
  difficulty: z.enum(["rookie", "detective", "cold_case"]).optional(),
  anonId: z.uuid().optional(),
  turnstileToken: z.string().min(1).optional(),
});

const SUSPECT_BRIEF_COLUMNS =
  "id, difficulty, statement, statement_teaser, silhouette_path";

type SuspectBrief = {
  id: string;
  difficulty: "rookie" | "detective" | "cold_case";
  statement: string;
  statement_teaser: string;
  silhouette_path: string | null;
};

export const POST = withRouteErrors(createRound);

async function createRound(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, "bad_request", "Malformed request body.");
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "bad_request", "Malformed request body.");
  }
  const { mode, difficulty, anonId, turnstileToken } = parsed.data;

  const identity = await resolveIdentity(anonId);
  if (!identity) {
    return apiError(
      401,
      "identity_required",
      "No badge, no case — sign in or let the app issue you a detective id.",
    );
  }

  const ip = requestIp(request);
  const admin = createAdminClient();

  const [ipAllowed, idAllowed] = [
    await hitLimit(admin, LIMITS.createPerIp, ip),
    await hitLimit(admin, LIMITS.createPerIdentity, identityRateKey(identity)),
  ];
  if (!ipAllowed || !idAllowed) {
    return apiError(
      429,
      "rate_limited",
      "Slow down, detective — the front desk needs a breather. Try again shortly.",
    );
  }

  const turnstile = await verifyTurnstile(turnstileToken, ip);
  if (!turnstile.ok) {
    return apiError(403, "turnstile_failed", turnstile.message);
  }

  // --- pick the suspect ----------------------------------------------------
  const today = utcToday();
  let suspect: SuspectBrief;

  if (mode === "daily") {
    const { data: daily, error: dailyError } = await admin
      .from("daily_suspects")
      .select("suspect_id")
      .eq("date", today)
      .maybeSingle();
    if (dailyError) {
      return apiError(500, "server_error", "Records room is jammed. Try again.");
    }
    if (!daily) {
      return apiError(
        404,
        "no_daily_case",
        "No case on the board today — check back after the morning briefing.",
      );
    }
    const { data, error } = await admin
      .from("suspects")
      .select(`${SUSPECT_BRIEF_COLUMNS}, status`)
      .eq("id", daily.suspect_id)
      .maybeSingle();
    if (error || !data || data.status !== "live") {
      return apiError(
        404,
        "no_daily_case",
        "Today's case file went missing. Check back later.",
      );
    }
    suspect = data;
  } else {
    let query = admin
      .from("suspects")
      .select(SUSPECT_BRIEF_COLUMNS)
      .eq("status", "live")
      .limit(200);
    if (difficulty) query = query.eq("difficulty", difficulty);
    const { data: pool, error } = await query;
    if (error) {
      return apiError(500, "server_error", "Records room is jammed. Try again.");
    }
    if (!pool || pool.length === 0) {
      return apiError(
        503,
        "pool_empty",
        "The precinct's case files are empty right now. Try again later.",
      );
    }
    suspect = pool[Math.floor(Math.random() * pool.length)];
  }

  // --- create the round ----------------------------------------------------
  if (identity.kind === "user") {
    await ensureProfile(admin, identity.id);
  }

  let roundId: string;
  const { data: created, error: insertError } = await admin
    .from("rounds")
    .insert({
      user_id: identity.kind === "user" ? identity.id : null,
      anon_id: identity.kind === "anon" ? identity.id : null,
      suspect_id: suspect.id,
      mode,
      daily_date: mode === "daily" ? today : null,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505" && mode === "daily") {
      // One daily per identity per day. If they opened it and never finished,
      // hand the same open round back; a finished round is a hard no.
      const column = identity.kind === "user" ? "user_id" : "anon_id";
      const { data: existing } = await admin
        .from("rounds")
        .select("id, revealed, final_score")
        .eq(column, identity.id)
        .eq("mode", "daily")
        .eq("daily_date", today)
        .maybeSingle();
      if (existing && !existing.revealed && existing.final_score === null) {
        roundId = existing.id;
      } else {
        return apiError(
          409,
          "daily_already_played",
          "You've already filed a sketch on today's case, detective. Come back tomorrow.",
          existing ? { roundId: existing.id } : undefined,
        );
      }
    } else {
      return apiError(500, "server_error", "Couldn't open the case file. Try again.");
    }
  } else {
    roundId = created.id;
  }

  // --- silhouette guide (safe to serve; the real image never leaves) --------
  let silhouetteUrl: string | null = null;
  if (suspect.silhouette_path) {
    const { data: signed } = await admin.storage
      .from("suspect-images")
      .createSignedUrl(suspect.silhouette_path, 60 * 60);
    silhouetteUrl = signed?.signedUrl ?? null;
  }

  const response: CreateRoundResponse = {
    roundId,
    mode,
    dailyDate: mode === "daily" ? today : null,
    difficulty: suspect.difficulty,
    statement: suspect.statement,
    statementTeaser: suspect.statement_teaser,
    silhouetteUrl,
  };
  return Response.json(response);
}