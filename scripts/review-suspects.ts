/**
 * Review CLI (Phase 2, step 7): walk every suspect in status='review',
 * show its statement + trait sheet, save the rendered image locally so it
 * can be eyeballed, and approve/reject from the terminal.
 *
 *   approve -> status 'live'      reject -> status 'retired'
 *
 * Usage: npm run review-suspects
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";
import { traitSheetLines, type TraitSheet } from "./pipeline/traits";

const BUCKET = "suspect-images";

async function main() {
  loadScriptEnv();
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: pending, error } = await supabase
    .from("suspects")
    .select("id, difficulty, statement, statement_teaser, traits, image_path, model_info")
    .eq("status", "review")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!pending?.length) {
    console.log("Nothing in review. Case closed.");
    return;
  }

  const reviewDir = join(process.cwd(), ".review-cache");
  mkdirSync(reviewDir, { recursive: true });
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`${pending.length} suspect(s) awaiting review.\n`);
  let approved = 0;
  let rejected = 0;

  for (const [index, suspect] of pending.entries()) {
    console.log("=".repeat(72));
    console.log(
      `[${index + 1}/${pending.length}] ${suspect.id} — ${suspect.difficulty}` +
        `  (fidelity: ${suspect.model_info?.fidelity ?? "?"}` +
        `${suspect.model_info?.statement_persona ? `, persona: ${suspect.model_info.statement_persona}` : ""})`,
    );

    // Save the image locally; most terminals can't render it inline, so a
    // clickable file path is the dead-simple review surface.
    if (suspect.image_path) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(BUCKET)
        .download(suspect.image_path);
      if (dlError) {
        console.log(`  (image download failed: ${dlError.message})`);
      } else {
        const localPath = join(reviewDir, `${suspect.id}.png`);
        writeFileSync(localPath, Buffer.from(await blob.arrayBuffer()));
        console.log(`  image: ${localPath}`);
      }
    }

    console.log(`\n  TEASER: ${suspect.statement_teaser}`);
    console.log(`\n  STATEMENT:\n    ${suspect.statement.replace(/\n/g, "\n    ")}`);
    console.log(`\n  TRAIT SHEET:`);
    for (const line of traitSheetLines(suspect.traits as TraitSheet)) {
      console.log(`    ${line}`);
    }

    const answer = (
      await rl.question("\n  [a]pprove -> live / [r]eject -> retired / [s]kip / [q]uit: ")
    )
      .trim()
      .toLowerCase();

    if (answer === "q") break;
    if (answer === "a" || answer === "r") {
      const status = answer === "a" ? "live" : "retired";
      const { error: updateError } = await supabase
        .from("suspects")
        .update({ status })
        .eq("id", suspect.id);
      if (updateError) {
        console.error(`  update failed: ${updateError.message}`);
      } else {
        console.log(`  -> ${status.toUpperCase()}`);
        if (status === "live") approved++;
        else rejected++;
      }
    } else {
      console.log("  -> skipped");
    }
    console.log();
  }

  rl.close();
  console.log(`Done: ${approved} approved, ${rejected} rejected.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});