/**
 * Offline content pipeline (Phase 2) — fills the suspect pool end-to-end:
 *
 *   roll traits -> witness statement (Claude) -> image (adapter)
 *   -> consistency check (Claude vision, regenerate up to 2x)
 *   -> silhouette pre-render (sharp) -> upload to private bucket
 *   -> insert row as status='review' (or 'draft' if fidelity stayed low)
 *
 * The live app never calls a generation API; this script is the only writer.
 *
 * Usage:
 *   npm run generate-suspects -- --count 5 --difficulty detective
 *   npm run generate-suspects -- --count 12 --difficulty mix --provider openai
 *   npm run generate-suspects -- --count 2 --dry-run   (no upload/insert; writes PNGs to .pipeline-out/)
 *
 * Flags:
 *   --count N          suspects to generate (default 5)
 *   --difficulty D     rookie | detective | cold_case | mix (default mix, 2:2:1)
 *   --provider P       openai | fal | mock (default $IMAGE_GEN_PROVIDER or mock)
 *   --seed N           RNG seed for reproducible trait rolls (default: random)
 *   --threshold N      fidelity threshold 0-100 (default 70)
 *   --dry-run          skip Supabase entirely; write artifacts to .pipeline-out/
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadScriptEnv, requireEnv } from "./lib/script-env";
import {
  DIFFICULTIES,
  makeRng,
  rollTraits,
  type Difficulty,
  type TraitSheet,
} from "./pipeline/traits";
import {
  generateStatement,
  STATEMENT_PROMPT_VERSION,
} from "./pipeline/statement";
import {
  buildImagePrompt,
  createImageGenerator,
  IMAGE_PROMPT_VERSION,
  type ImageProvider,
} from "./pipeline/image-gen";
import {
  checkConsistency,
  CONSISTENCY_PROMPT_VERSION,
  DEFAULT_FIDELITY_THRESHOLD,
  type ConsistencyReport,
} from "./pipeline/consistency";
import { renderSilhouette, SILHOUETTE_VERSION } from "./pipeline/silhouette";
import { CostTracker, logCostRecord } from "./pipeline/costs";

const BUCKET = "suspect-images";
const MAX_IMAGE_ATTEMPTS = 3; // initial render + up to 2 regenerations

async function main() {
  loadScriptEnv();

  const { values } = parseArgs({
    options: {
      count: { type: "string", default: "5" },
      difficulty: { type: "string", default: "mix" },
      provider: { type: "string" },
      seed: { type: "string" },
      threshold: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const count = Number.parseInt(values.count ?? "5", 10);
  if (!Number.isFinite(count) || count < 1) throw new Error("bad --count");

  const difficultyArg = values.difficulty ?? "mix";
  if (difficultyArg !== "mix" && !DIFFICULTIES.includes(difficultyArg as Difficulty)) {
    throw new Error(`bad --difficulty: ${difficultyArg}`);
  }

  const provider = (values.provider ??
    process.env.IMAGE_GEN_PROVIDER ??
    "mock") as ImageProvider;
  if (!["openai", "fal", "mock"].includes(provider)) {
    throw new Error(`bad --provider: ${provider}`);
  }

  const threshold = values.threshold
    ? Number.parseInt(values.threshold, 10)
    : DEFAULT_FIDELITY_THRESHOLD;
  const seed = values.seed
    ? Number.parseInt(values.seed, 10)
    : Math.floor(Math.random() * 2 ** 31);
  const dryRun = values["dry-run"] ?? false;

  const claudeModel = process.env.PIPELINE_CLAUDE_MODEL ?? "claude-opus-4-8";
  // Zero-arg constructor resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
  // or an `ant auth login` profile — don't hard-require the env var.
  const anthropic = new Anthropic();
  // fal.ai's own tooling looks for FAL_KEY, so honor it first for the fal
  // provider; IMAGE_GEN_API_KEY is the generic fallback (and openai's key).
  const imageKey =
    provider === "fal"
      ? (process.env.FAL_KEY ?? process.env.IMAGE_GEN_API_KEY)
      : process.env.IMAGE_GEN_API_KEY;
  const imageGen = createImageGenerator(provider, imageKey);

  const supabase = dryRun ? null : adminClient();
  const outDir = join(process.cwd(), ".pipeline-out");
  if (dryRun) mkdirSync(outDir, { recursive: true });

  const rng = makeRng(seed);
  console.log(
    `Generating ${count} suspect(s) — difficulty=${difficultyArg} provider=${provider} model=${claudeModel} seed=${seed}${dryRun ? " [DRY RUN]" : ""}`,
  );

  const batchCosts: number[] = [];
  let failures = 0;

  for (let i = 0; i < count; i++) {
    const difficulty: Difficulty =
      difficultyArg === "mix"
        ? // 2:2:1 rookie:detective:cold_case, matching launch pool ratios
          ([...Array(2).fill("rookie"), ...Array(2).fill("detective"), "cold_case"] as Difficulty[])[
            i % 5
          ]
        : (difficultyArg as Difficulty);

    console.log(`\n[${i + 1}/${count}] rolling ${difficulty} suspect...`);
    try {
      const cost = await generateOne({
        anthropic,
        claudeModel,
        imageGen,
        supabase,
        outDir: dryRun ? outDir : null,
        difficulty,
        traits: rollTraits(rng),
        threshold,
      });
      batchCosts.push(cost);
    } catch (err) {
      failures++;
      console.error(`[${i + 1}/${count}] FAILED:`, err);
    }
  }

  const total = batchCosts.reduce((a, b) => a + b, 0);
  console.log(
    `\nBatch done: ${batchCosts.length} generated, ${failures} failed, total cost $${total.toFixed(4)}.`,
  );
  logCostRecord({
    kind: "batch",
    count: batchCosts.length,
    failures,
    total_usd: Math.round(total * 10_000) / 10_000,
    provider,
    model: claudeModel,
    seed,
  });
  if (failures > 0) process.exitCode = 1;
}

async function generateOne(ctx: {
  anthropic: Anthropic;
  claudeModel: string;
  imageGen: ReturnType<typeof createImageGenerator>;
  supabase: SupabaseClient | null;
  outDir: string | null;
  difficulty: Difficulty;
  traits: TraitSheet;
  threshold: number;
}): Promise<number> {
  const id = randomUUID();
  const costs = new CostTracker();

  // 1-2. Witness statement from the trait sheet.
  const statement = await generateStatement(
    ctx.anthropic,
    ctx.claudeModel,
    ctx.difficulty,
    ctx.traits,
    costs,
  );
  console.log(`  statement: "${statement.statement_teaser}"`);

  // 3-4. Image + consistency loop.
  const imagePrompt = buildImagePrompt(ctx.traits);
  let best: { image: Buffer; report: ConsistencyReport } | null = null;
  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    const image = await ctx.imageGen.generateImage(imagePrompt);
    costs.addImage(`render (attempt ${attempt})`, ctx.imageGen.provider);
    const report = await checkConsistency(
      ctx.anthropic,
      ctx.claudeModel,
      ctx.traits,
      image,
      costs,
      `attempt ${attempt}`,
    );
    console.log(
      `  render attempt ${attempt}: fidelity ${report.fidelity}${report.faceCovered ? " (FACE COVERED)" : ""}${
        report.mismatches.length ? ` — misses: ${report.mismatches.join("; ")}` : ""
      }`,
    );
    if (!report.faceCovered && (!best || report.fidelity > best.report.fidelity)) {
      best = { image, report };
    }
    if (!report.faceCovered && report.fidelity >= ctx.threshold) break;
  }
  if (!best) {
    throw new Error("all renders had covered faces — nothing usable");
  }
  const passed = best.report.fidelity >= ctx.threshold;
  const status = passed ? "review" : "draft";

  // 5. Silhouette pre-render.
  const silhouette = await renderSilhouette(best.image);

  const imagePath = `suspects/${id}.png`;
  const silhouettePath = `suspects/${id}-silhouette.png`;
  const modelInfo = {
    pipeline: {
      statement_prompt_version: STATEMENT_PROMPT_VERSION,
      image_prompt_version: IMAGE_PROMPT_VERSION,
      consistency_prompt_version: CONSISTENCY_PROMPT_VERSION,
      silhouette_version: SILHOUETTE_VERSION,
    },
    claude_model: ctx.claudeModel,
    image_provider: ctx.imageGen.provider,
    image_model: ctx.imageGen.model,
    image_prompt: imagePrompt,
    fidelity: best.report.fidelity,
    fidelity_mismatches: best.report.mismatches,
    cost: costs.summary(),
  };

  // 6. Upload + insert (or dry-run artifacts).
  if (ctx.outDir) {
    writeFileSync(join(ctx.outDir, `${id}.png`), best.image);
    writeFileSync(join(ctx.outDir, `${id}-silhouette.png`), silhouette);
    writeFileSync(
      join(ctx.outDir, `${id}.json`),
      JSON.stringify(
        {
          id,
          difficulty: ctx.difficulty,
          ...statement,
          traits: ctx.traits,
          status,
          model_info: modelInfo,
        },
        null,
        2,
      ),
    );
    console.log(`  [dry run] wrote artifacts to .pipeline-out/${id}.*`);
  } else if (ctx.supabase) {
    await upload(ctx.supabase, imagePath, best.image);
    await upload(ctx.supabase, silhouettePath, silhouette);
    const { error } = await ctx.supabase.from("suspects").insert({
      id,
      difficulty: ctx.difficulty,
      statement: statement.statement,
      statement_teaser: statement.statement_teaser,
      traits: ctx.traits,
      image_path: imagePath,
      silhouette_path: silhouettePath,
      status,
      model_info: modelInfo,
    });
    if (error) throw new Error(`insert failed: ${error.message}`);
  }

  console.log(`  suspect ${id} [${ctx.difficulty}/${status}]`);
  costs.print(" ");
  logCostRecord({
    kind: "suspect",
    id,
    difficulty: ctx.difficulty,
    status,
    fidelity: best.report.fidelity,
    ...costs.summary(),
  });
  return costs.totalUsd;
}

async function upload(supabase: SupabaseClient, path: string, png: Buffer) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`upload ${path} failed: ${error.message}`);
}

function adminClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});