import type { NextRequest } from "next/server";
import { z } from "zod";
import type {
  DailyLeaderboardResponse,
  LeaderboardEntry,
} from "@/lib/game/api-types";
import { apiError, utcToday, withRouteErrors } from "@/lib/server/api";
import { resolveIdentity } from "@/lib/server/identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/daily/leaderboard?date=&offset=&anonId= (Phase 6).
 *
 * Pages through the daily_leaderboard RPC (handles only — no avatars, no
 * links) and, when the caller has an identity, computes their own rank the
 * same way the board orders rows (score desc, earlier submission wins ties).
 * Anonymous viewers must present their anonId; signed-in viewers are read
 * from the auth cookie.
 */

const PAGE_SIZE = 20;

const QuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
  anonId: z.uuid().optional(),
});

type LeaderboardRow = {
  rank: number | string;
  handle: string;
  final_score: number | string;
};

export const GET = withRouteErrors("daily.leaderboard", leaderboard);

async function leaderboard(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = QuerySchema.safeParse({
    date: params.get("date") ?? undefined,
    offset: params.get("offset") ?? undefined,
    anonId: params.get("anonId") ?? undefined,
  });
  if (!parsed.success) {
    return apiError(400, "bad_request", "Malformed leaderboard query.");
  }
  const date = parsed.data.date ?? utcToday();
  const offset = parsed.data.offset ?? 0;
  if (date > utcToday()) {
    return apiError(400, "bad_date", "That case hasn't been posted yet.");
  }

  const admin = createAdminClient();

  const { data: rows, error } = await admin.rpc("daily_leaderboard", {
    for_date: date,
    top_n: PAGE_SIZE + 1,
    skip_n: offset,
  });
  if (error) {
    return apiError(500, "server_error", "The board fell off the wall. Try again.");
  }
  const list = (rows ?? []) as LeaderboardRow[];
  const hasMore = list.length > PAGE_SIZE;
  const entries: LeaderboardEntry[] = list.slice(0, PAGE_SIZE).map((row) => ({
    rank: Number(row.rank),
    handle: row.handle,
    score: Number(row.final_score),
  }));

  let viewer: DailyLeaderboardResponse["viewer"] = null;
  const identity = await resolveIdentity(parsed.data.anonId);
  if (identity) {
    const column = identity.kind === "user" ? "user_id" : "anon_id";
    const { data: mine } = await admin
      .from("rounds")
      .select("final_score, created_at")
      .eq(column, identity.id)
      .eq("mode", "daily")
      .eq("daily_date", date)
      .not("final_score", "is", null)
      .maybeSingle();
    if (mine && mine.final_score !== null) {
      const { count } = await admin
        .from("rounds")
        .select("id", { count: "exact", head: true })
        .eq("mode", "daily")
        .eq("daily_date", date)
        .not("final_score", "is", null)
        .or(
          `final_score.gt.${mine.final_score},and(final_score.eq.${mine.final_score},created_at.lt."${mine.created_at}")`,
        );
      viewer = {
        rank: (count ?? 0) + 1,
        score: Number(mine.final_score),
      };
    }
  }

  const response: DailyLeaderboardResponse = {
    date,
    entries,
    viewer,
    hasMore,
  };
  return Response.json(response);
}