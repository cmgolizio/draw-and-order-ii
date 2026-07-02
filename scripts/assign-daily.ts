/**
 * Daily assignment (Phase 2, step 8): fill `daily_suspects` for the next N
 * days from live detective-difficulty suspects that have never been a daily
 * (unique(suspect_id) makes reuse impossible anyway; we filter up front).
 *
 * Idempotent — dates that already have an assignment are left alone — so it
 * is safe to run on a cron.
 *
 * Usage: npm run assign-daily -- --days 30
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";

/** Dailies flip at a fixed UTC hour (Phase 6); dates here are UTC dates. */
function utcDateString(daysFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function main() {
  loadScriptEnv();
  const { values } = parseArgs({
    options: { days: { type: "string", default: "30" } },
  });
  const days = Number.parseInt(values.days ?? "30", 10);
  if (!Number.isFinite(days) || days < 1) throw new Error("bad --days");

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const wantedDates = Array.from({ length: days }, (_, i) => utcDateString(i));

  const { data: existing, error: existingError } = await supabase
    .from("daily_suspects")
    .select("date")
    .in("date", wantedDates);
  if (existingError) throw new Error(existingError.message);
  const taken = new Set((existing ?? []).map((row) => row.date));
  const openDates = wantedDates.filter((d) => !taken.has(d));
  if (!openDates.length) {
    console.log(`All ${days} day(s) already assigned. Nothing to do.`);
    return;
  }

  // Live detective suspects never used as a daily.
  const { data: used, error: usedError } = await supabase
    .from("daily_suspects")
    .select("suspect_id");
  if (usedError) throw new Error(usedError.message);
  const usedIds = new Set((used ?? []).map((row) => row.suspect_id));

  const { data: candidates, error: candidatesError } = await supabase
    .from("suspects")
    .select("id")
    .eq("status", "live")
    .eq("difficulty", "detective");
  if (candidatesError) throw new Error(candidatesError.message);

  const pool = (candidates ?? []).filter((s) => !usedIds.has(s.id));
  if (pool.length < openDates.length) {
    console.warn(
      `Only ${pool.length} unused live detective suspect(s) for ${openDates.length} open day(s) — assigning what we have. Generate more!`,
    );
  }

  // Shuffle so assignment order doesn't mirror generation order.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const rows = openDates
    .slice(0, pool.length)
    .map((date, i) => ({ date, suspect_id: pool[i].id }));
  if (!rows.length) {
    console.log("No candidates available. Nothing assigned.");
    process.exitCode = 1;
    return;
  }

  const { error: insertError } = await supabase.from("daily_suspects").insert(rows);
  if (insertError) throw new Error(insertError.message);

  for (const row of rows) console.log(`assigned ${row.date} -> ${row.suspect_id}`);
  console.log(
    `Done: ${rows.length} day(s) assigned${rows.length < openDates.length ? `, ${openDates.length - rows.length} still open` : ""}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});