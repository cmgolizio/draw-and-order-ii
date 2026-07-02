/**
 * Seeds two fake suspects (Phase 1 acceptance): one `live`, one `review`,
 * so the RLS test can prove non-live suspects stay invisible to clients.
 *
 * Usage: npm run seed  (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY)
 */
import { createClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";
import { SEED_SUSPECTS } from "./lib/seed-data";

async function main() {
  loadScriptEnv();

  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await admin
    .from("suspects")
    .upsert([...SEED_SUSPECTS], { onConflict: "id" })
    .select("id, status, difficulty");

  if (error) throw new Error(`Seed failed: ${error.message}`);

  for (const row of data) {
    console.log(`seeded suspect ${row.id} [${row.difficulty}/${row.status}]`);
  }
  console.log(`OK — ${data.length} fake suspects in place.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});