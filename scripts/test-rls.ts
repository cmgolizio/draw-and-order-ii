/**
 * Phase 1 acceptance test: proves the client (publishable key / anon) role
 *   1. cannot read the suspects base table at all,
 *   2. sees only live suspects through suspects_public,
 *   3. can never obtain image_path (column absent from the view),
 *   4. cannot read daily_suspects or other people's rounds.
 * Sanity-checks with the secret key so a broken seed can't fake a pass.
 *
 * Usage: npm run seed && npm run test:rls
 */
import { createClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";
import { SEED_SUSPECTS } from "./lib/seed-data";

loadScriptEnv();

const LIVE_ID = SEED_SUSPECTS[0].id;
const REVIEW_ID = SEED_SUSPECTS[1].id;

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anon = createClient(
    url,
    requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  );

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (secretKey) {
    console.log("secret key sanity:");
    const admin = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adminRes = await admin
      .from("suspects")
      .select("id, status, image_path")
      .in("id", [LIVE_ID, REVIEW_ID]);
    check(
      "secret key reads both seed suspects incl. image_path",
      !adminRes.error &&
        adminRes.data?.length === 2 &&
        adminRes.data.every((r) => typeof r.image_path === "string"),
      adminRes.error?.message ?? `got ${adminRes.data?.length ?? 0} rows`,
    );
  } else {
    console.warn(
      "  SKIP  secret key sanity (SUPABASE_SECRET_KEY not set) — " +
        "verify both seed suspects exist by other means",
    );
  }

  console.log("anon (client) role:");

  const baseTable = await anon.from("suspects").select("*");
  check(
    "suspects base table is sealed",
    baseTable.error !== null || baseTable.data?.length === 0,
    `unexpectedly got ${baseTable.data?.length ?? 0} rows`,
  );

  const pub = await anon.from("suspects_public").select("*");
  check("suspects_public is readable", pub.error === null, pub.error?.message);

  const rows = pub.data ?? [];
  check(
    "live seed suspect is visible",
    rows.some((r) => r.id === LIVE_ID),
  );
  check(
    "non-live (review) suspect is NOT visible",
    !rows.some((r) => r.id === REVIEW_ID),
  );
  check(
    "no image_path/status leak in returned columns",
    rows.every((r) => !("image_path" in r) && !("status" in r)),
    `columns: ${rows[0] ? Object.keys(rows[0]).join(", ") : "n/a"}`,
  );

  const imagePath = await anon.from("suspects_public").select("image_path");
  check(
    "selecting image_path from the view errors",
    imagePath.error !== null,
    "select('image_path') succeeded",
  );

  const daily = await anon.from("daily_suspects").select("*");
  check(
    "daily_suspects is sealed",
    daily.error !== null || daily.data?.length === 0,
    `unexpectedly got ${daily.data?.length ?? 0} rows`,
  );

  const rounds = await anon.from("rounds").select("*");
  check(
    "rounds are invisible to anonymous clients",
    rounds.error !== null || rounds.data?.length === 0,
    `unexpectedly got ${rounds.data?.length ?? 0} rows`,
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll RLS checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});