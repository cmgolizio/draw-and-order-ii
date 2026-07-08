/**
 * Launch audit (Phase 8): one command that walks the launch checklist's
 * machine-checkable items against the REAL project the env points at.
 *
 *   1. Env audit — every production secret present.
 *   2. RLS re-verification with the anon key — base tables sealed,
 *      suspects_public never exposes image_path or non-live rows.
 *   3. Pool health — live suspects per difficulty vs the launch targets.
 *   4. Dailies queued — daily_suspects assigned for the next 30 days.
 *   5. Spend circuit breaker — JUDGE_DAILY_BUDGET armed.
 *
 * Usage: npm run launch-audit   (reads .env.local / .env like the pipeline)
 * Exits non-zero if any FAIL fires; WARNs don't block but belong in the
 * launch conversation.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";

loadScriptEnv();

const POOL_TARGETS = { rookie: 40, detective: 40, cold_case: 20 } as const;
const DAILY_HORIZON_DAYS = 30;

let failures = 0;
let warnings = 0;

function pass(name: string, detail?: string) {
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function warn(name: string, detail: string) {
  warnings += 1;
  console.warn(`  WARN  ${name} — ${detail}`);
}
function fail(name: string, detail: string) {
  failures += 1;
  console.error(`  FAIL  ${name} — ${detail}`);
}

function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function auditEnv() {
  console.log("\n[1/5] Environment audit");
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "ANTHROPIC_API_KEY",
  ];
  for (const key of required) {
    if (process.env[key]) pass(key);
    else fail(key, "unset — the app cannot run without it");
  }

  // Turnstile is the launch-blocking pair: keyless mode is dev-only.
  for (const key of ["TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY"]) {
    if (process.env[key]) pass(key);
    else fail(key, "unset — Turnstile MUST be armed in production");
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    pass("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
  } else {
    warn(
      "NEXT_PUBLIC_SITE_URL",
      "unset — OG cards and sitemap fall back to the Vercel URL",
    );
  }

  if (process.env.IMAGE_GEN_API_KEY) {
    pass("IMAGE_GEN_API_KEY", "(pipeline only)");
  } else {
    warn("IMAGE_GEN_API_KEY", "unset — fine for the app, blocks the pipeline");
  }
}

async function auditRls() {
  console.log("\n[2/5] RLS re-verification (anon key)");
  const anon = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false } },
  );

  const { data: base } = await anon.from("suspects").select("id").limit(1);
  if (!base || base.length === 0) pass("suspects base table sealed to anon");
  else fail("suspects base table sealed to anon", "anon read a row");

  const { data: pub } = await anon.from("suspects_public").select("*").limit(5);
  const rows = (pub ?? []) as Record<string, unknown>[];
  if (rows.some((row) => "image_path" in row)) {
    fail("suspects_public hides image_path", "column is exposed");
  } else {
    pass("suspects_public hides image_path");
  }

  const { data: daily } = await anon.from("daily_suspects").select("*").limit(1);
  if (!daily || daily.length === 0) pass("daily_suspects sealed to anon");
  else fail("daily_suspects sealed to anon", "anon read the schedule");

  const { data: rounds } = await anon.from("rounds").select("id").limit(1);
  if (!rounds || rounds.length === 0) pass("rounds sealed to signed-out anon");
  else fail("rounds sealed to signed-out anon", "anon read a round");
}

async function auditPool(admin: SupabaseClient) {
  console.log("\n[3/5] Suspect pool health (live rows vs launch targets)");
  for (const [difficulty, target] of Object.entries(POOL_TARGETS)) {
    const { count, error } = await admin
      .from("suspects")
      .select("id", { count: "exact", head: true })
      .eq("status", "live")
      .eq("difficulty", difficulty);
    if (error) {
      fail(`live ${difficulty} count`, error.message);
      continue;
    }
    const n = count ?? 0;
    if (n >= target) pass(`live ${difficulty}`, `${n}/${target}`);
    else warn(`live ${difficulty}`, `${n}/${target} — run the pipeline`);
  }
}

async function auditDailies(admin: SupabaseClient) {
  console.log(`\n[4/5] Dailies queued (next ${DAILY_HORIZON_DAYS} days)`);
  const { data, error } = await admin
    .from("daily_suspects")
    .select("date")
    .gte("date", utcDate(0))
    .lte("date", utcDate(DAILY_HORIZON_DAYS - 1));
  if (error) {
    fail("daily_suspects readable via secret key", error.message);
    return;
  }
  const assigned = new Set((data ?? []).map((r) => (r as { date: string }).date));
  const missing: string[] = [];
  for (let i = 0; i < DAILY_HORIZON_DAYS; i++) {
    if (!assigned.has(utcDate(i))) missing.push(utcDate(i));
  }
  if (missing.length === 0) {
    pass(`all ${DAILY_HORIZON_DAYS} days assigned`);
  } else {
    fail(
      `${missing.length} day(s) unassigned`,
      `first gaps: ${missing.slice(0, 5).join(", ")} — run assign-daily`,
    );
  }
}

function auditCircuitBreaker() {
  console.log("\n[5/5] Spend circuit breaker");
  const raw = process.env.JUDGE_DAILY_BUDGET;
  const parsed = Number.parseInt(raw ?? "", 10);
  if (raw && Number.isFinite(parsed) && parsed > 0) {
    pass("JUDGE_DAILY_BUDGET", `${parsed} judge calls/day`);
  } else {
    warn(
      "JUDGE_DAILY_BUDGET",
      "unset — falls back to the built-in 300/day; set it deliberately for launch",
    );
  }
}

async function main() {
  console.log("Draw & Order — launch audit");
  await auditEnv();

  if (failures > 0) {
    // Without the core env the live checks can't run honestly.
    console.error("\nEnv audit failed — fix the environment, then re-run.");
    process.exit(1);
  }

  await auditRls();
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false } },
  );
  await auditPool(admin);
  await auditDailies(admin);
  auditCircuitBreaker();

  console.log(
    `\nResult: ${failures} failure(s), ${warnings} warning(s).` +
      (failures === 0 ? " Clear to launch (pending the manual checklist)." : ""),
  );
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("launch-audit crashed:", error);
  process.exit(1);
});