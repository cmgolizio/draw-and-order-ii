import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { judgeDailyBudget } from "@/lib/env";

/**
 * Sliding-window rate limits (Phase 4 abuse & cost control), backed by the
 * rate_limit_hit RPC (Postgres, service-role only). Limits are config
 * constants here; the judge budget is env-tunable (JUDGE_DAILY_BUDGET).
 */

type Limit = { bucket: string; windowSeconds: number; max: number };

export const LIMITS = {
  /** Opening cases: cheap (no judge call), so relatively generous. */
  createPerIp: { bucket: "create-ip", windowSeconds: 3600, max: 30 },
  createPerIdentity: { bucket: "create-id", windowSeconds: 3600, max: 30 },
  /** Submissions burn a judge call each — the numbers from the build plan. */
  submitPerIp: { bucket: "submit-ip", windowSeconds: 3600, max: 10 },
  submitPerIdentity: { bucket: "submit-id", windowSeconds: 3600, max: 10 },
  submitAnonPerDay: { bucket: "submit-anon-day", windowSeconds: 86400, max: 30 },
  submitAuthedPerDay: {
    bucket: "submit-authed-day",
    windowSeconds: 86400,
    max: 60,
  },
} as const satisfies Record<string, Limit>;

/**
 * Records a hit and returns whether it was allowed. Blocked attempts are not
 * recorded, so hammering a closed door never extends the lockout.
 */
export async function hitLimit(
  admin: SupabaseClient,
  limit: Limit,
  key: string,
): Promise<boolean> {
  const { data, error } = await admin.rpc("rate_limit_hit", {
    p_bucket: limit.bucket,
    p_key: key,
    p_window_seconds: limit.windowSeconds,
    p_max: limit.max,
  });
  if (error) {
    throw new Error(`rate_limit_hit failed: ${error.message}`);
  }

  // Opportunistic GC — no cron dependency; ~2% of hits sweep old events.
  if (Math.random() < 0.02) {
    admin.rpc("rate_limit_gc").then(
      () => {},
      () => {},
    );
  }

  return data === true;
}

/**
 * The per-day global spend circuit breaker: one hit per judge call. When the
 * daily budget is exhausted the app flips to "precinct closed" instead of
 * burning money.
 */
export async function hitJudgeBudget(admin: SupabaseClient): Promise<boolean> {
  return hitLimit(
    admin,
    { bucket: "judge-global", windowSeconds: 86400, max: judgeDailyBudget() },
    "global",
  );
}