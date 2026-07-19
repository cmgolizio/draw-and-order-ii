/**
 * Pool wipe (polish plan Phase 4): retire the v1 pool and clear forward
 * daily assignments so `assign-daily` can refill from the regenerated v2
 * pool.
 *
 * Old suspects are RETIRED, never deleted — `rounds.suspect_id` references
 * them and historical results pages must keep resolving.
 *
 * "v1" is intrinsic, not time-based: any suspect without a `qa_bank`
 * predates the Phase 3 pipeline and belongs to the old pool. A freshly
 * approved v2 batch (qa_bank present) is left alone, so the zero-downtime
 * order is: generate + approve v2 to live first, then run this, then
 * `assign-daily`. Stale v1 rows still in review/draft are retired too so
 * they can't pollute the v2 review queue.
 *
 * Usage:
 *   npm run retire-pool -- --dry-run
 *   npm run retire-pool
 *   npm run retire-pool -- --from 2026-07-20
 *
 * Flags:
 *   --dry-run   report what would change; write nothing
 *   --from D    clear daily_suspects rows with date >= D (default today UTC).
 *               Today's daily is cleared by default on purpose — the round
 *               API 404s a daily whose suspect is retired, so today must be
 *               reassigned from the new pool right after this runs.
 *   --all       retire every non-retired suspect, v2 included (recovery use)
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";

const RETIRABLE_STATUSES = ["live", "review", "draft"] as const;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  loadScriptEnv();
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      from: { type: "string" },
      all: { type: "boolean", default: false },
    },
  });
  const dryRun = values["dry-run"] ?? false;
  const from = values.from ?? utcToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error(`bad --from: ${from}`);

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // --- old suspects --------------------------------------------------------
  let query = supabase
    .from("suspects")
    .select("id, difficulty, status")
    .in("status", [...RETIRABLE_STATUSES]);
  if (!values.all) query = query.is("qa_bank", null);
  const { data: targets, error: targetsError } = await query;
  if (targetsError) throw new Error(targetsError.message);

  const byBucket = new Map<string, number>();
  for (const s of targets ?? []) {
    const key = `${s.status}/${s.difficulty}`;
    byBucket.set(key, (byBucket.get(key) ?? 0) + 1);
  }
  console.log(
    `${targets?.length ?? 0} ${values.all ? "" : "v1 (no qa_bank) "}suspect(s) to retire:`,
  );
  for (const [bucket, n] of [...byBucket.entries()].sort()) {
    console.log(`  ${bucket}: ${n}`);
  }

  // --- forward dailies -----------------------------------------------------
  const { data: dailies, error: dailiesError } = await supabase
    .from("daily_suspects")
    .select("date, suspect_id")
    .gte("date", from)
    .order("date", { ascending: true });
  if (dailiesError) throw new Error(dailiesError.message);
  console.log(`${dailies?.length ?? 0} daily assignment(s) on/after ${from} to clear.`);
  for (const d of dailies ?? []) console.log(`  ${d.date} -> ${d.suspect_id}`);

  if (dryRun) {
    console.log("\n[DRY RUN] nothing written.");
    return;
  }

  if (targets?.length) {
    // Chunk the id list so a big pool can't overflow the PostgREST filter.
    for (let i = 0; i < targets.length; i += 100) {
      const ids = targets.slice(i, i + 100).map((s) => s.id);
      const { error } = await supabase
        .from("suspects")
        .update({ status: "retired" })
        .in("id", ids);
      if (error) throw new Error(`retire failed: ${error.message}`);
    }
    console.log(`\nRetired ${targets.length} suspect(s).`);
  }

  if (dailies?.length) {
    const { error } = await supabase
      .from("daily_suspects")
      .delete()
      .gte("date", from);
    if (error) throw new Error(`daily clear failed: ${error.message}`);
    console.log(`Cleared ${dailies.length} daily assignment(s) from ${from} forward.`);
  }

  console.log(
    "Done. Run `npm run assign-daily` next so today's case isn't left empty.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
