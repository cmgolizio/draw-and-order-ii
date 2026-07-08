import type { NextRequest } from "next/server";
import { z } from "zod";
import type { MigrateAnonResponse } from "@/lib/game/api-types";
import { apiError, withRouteErrors } from "@/lib/server/api";
import { logError, logEvent, logWarn } from "@/lib/server/log";
import { ensureProfile, requestIp } from "@/lib/server/identity";
import { hitLimit, LIMITS } from "@/lib/server/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/migrate-anon — the one-time anonymous-history claim (Phase 5).
 *
 * A signed-in player presents the anonId from their localStorage; the
 * claim_anon_rounds RPC burns the id (permanently — it can never be claimed
 * into a second account), resolves daily-uniqueness conflicts by keeping the
 * higher score, and reassigns the surviving rounds to the account. Streaks
 * survive for free: user_stats derives them from the claimed daily rounds.
 */

const BodySchema = z.object({ anonId: z.uuid() });

type ClaimSummary = {
  status: "claimed" | "already_claimed" | "burned";
  claimed: number;
  dropped_drawings: string[];
};

export const POST = withRouteErrors("migrate-anon", migrateAnon);

async function migrateAnon(request: NextRequest) {
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

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return apiError(
      401,
      "auth_required",
      "Sign in before claiming a case history, detective.",
    );
  }

  const admin = createAdminClient();
  const ipAllowed = await hitLimit(admin, LIMITS.migratePerIp, requestIp(request));
  const idAllowed = await hitLimit(
    admin,
    LIMITS.migratePerIdentity,
    `u:${auth.user.id}`,
  );
  if (!ipAllowed || !idAllowed) {
    return apiError(
      429,
      "rate_limited",
      "Slow down, detective — the records clerk files one box at a time.",
    );
  }

  await ensureProfile(admin, auth.user.id);

  const { data, error } = await admin.rpc("claim_anon_rounds", {
    p_anon_id: parsed.data.anonId,
    p_user_id: auth.user.id,
  });
  if (error) {
    // Two claims raced to the burn insert; the loser lands here. Look up who
    // won so a same-user double tap stays an idempotent success.
    if (error.code === "23505") {
      const { data: claim } = await admin
        .from("claimed_anon_ids")
        .select("user_id")
        .eq("anon_id", parsed.data.anonId)
        .maybeSingle();
      if (claim?.user_id === auth.user.id) {
        const response: MigrateAnonResponse = {
          status: "already_claimed",
          claimedRounds: 0,
        };
        return Response.json(response);
      }
      return apiError(
        409,
        "anon_id_burned",
        "That badge number was already claimed by another detective.",
      );
    }
    logError("migrate_claim_failed", {
      userId: auth.user.id,
      error: error.message,
    });
    return apiError(
      500,
      "server_error",
      "The records clerk dropped the box. Try again shortly.",
    );
  }
  const summary = data as ClaimSummary;

  if (summary.status === "burned") {
    return apiError(
      409,
      "anon_id_burned",
      "That badge number was already claimed by another detective.",
    );
  }

  // Conflict losers leave orphaned sketches behind — sweep them, best effort.
  if (summary.dropped_drawings.length > 0) {
    const { error: removeError } = await admin.storage
      .from("drawings")
      .remove(summary.dropped_drawings);
    if (removeError) {
      logWarn("migrate_orphan_sweep_failed", {
        paths: summary.dropped_drawings,
        error: removeError.message,
      });
    }
  }

  logEvent("anon_claimed", {
    userId: auth.user.id,
    status: summary.status,
    rounds: summary.claimed,
  });

  const response: MigrateAnonResponse = {
    status: summary.status,
    claimedRounds: summary.claimed,
  };
  return Response.json(response);
}