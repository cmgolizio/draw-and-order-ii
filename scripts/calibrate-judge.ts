/**
 * Judge calibration (Phase 4): score a fixed set of reference drawings
 * against a live suspect and sanity-check the rubric. Run this whenever the
 * judge prompt changes (JUDGE_PROMPT_VERSION) or the weights move.
 *
 *   npm run calibrate-judge             # first live suspect with an image
 *   npm run calibrate-judge -- --suspect <uuid>
 *   npm run calibrate-judge -- --model claude-haiku-4-5
 *
 * Reference set:
 *   - Fixed, suspect-independent PNGs (blank / scribbles / shapes / text /
 *     generic faces) generated deterministically into
 *     scripts/calibration/drawings/ on first run.
 *   - Derived-at-runtime sketches: the suspect's own portrait "traced"
 *     (grayscaled + softened — should score HIGH) and a different suspect's
 *     portrait traced the same way (the wrong face — must score lower).
 *
 * Hard requirement from the build plan: a blank canvas must score < 10.
 * Results are written to scripts/calibration/results-*.json (keep them).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  DEFAULT_JUDGE_MODEL,
  JUDGE_PROMPT_VERSION,
  runJudge,
} from "@/lib/game/judge";
import { computeFinalScore, SCORING_VERSION } from "@/lib/game/scoring";
import { TraitSheetSchema, type Difficulty } from "@/lib/game/trait-sheet";
import { loadScriptEnv, requireEnv } from "./lib/script-env";
import { CostTracker, logCostRecord } from "./pipeline/costs";
import { makeRng } from "./pipeline/traits";

const CANVAS_W = 800;
const CANVAS_H = 1040;
const PAPER = "#fbf9f4";
const INK = "#1a1814";

const CALIBRATION_DIR = join(process.cwd(), "scripts", "calibration");
const DRAWINGS_DIR = join(CALIBRATION_DIR, "drawings");

type Expectation = { max?: number; min?: number };

type Reference = {
  name: string;
  kind: "fixed" | "derived";
  /** Bounds on the FINAL score; violations fail the run. */
  expect: Expectation;
  png(): Promise<Buffer>;
};

// ---------------------------------------------------------------------------
// Fixed references — deterministic SVGs rasterized once into drawings/.
// ---------------------------------------------------------------------------

function svgDoc(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}">` +
    `<rect width="100%" height="100%" fill="${PAPER}"/>${body}</svg>`
  );
}

function scribblePath(seed: number, strokes: number, jitter: number): string {
  const rng = makeRng(seed);
  let body = "";
  for (let s = 0; s < strokes; s++) {
    let x = 100 + rng() * 600;
    let y = 150 + rng() * 740;
    let d = `M ${x.toFixed(0)} ${y.toFixed(0)}`;
    for (let i = 0; i < 12; i++) {
      x = Math.max(40, Math.min(760, x + (rng() - 0.5) * jitter));
      y = Math.max(40, Math.min(1000, y + (rng() - 0.5) * jitter));
      d += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    body += `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${(3 + rng() * 5).toFixed(1)}" stroke-opacity="0.7"/>`;
  }
  return body;
}

const FIXED_SVGS: Record<string, string> = {
  // The build plan's hard case: blank canvas scores < 10.
  blank: svgDoc(""),
  "scribble-light": svgDoc(scribblePath(11, 4, 180)),
  "scribble-dense": svgDoc(scribblePath(29, 30, 260)),
  shapes: svgDoc(
    `<rect x="180" y="220" width="280" height="200" fill="none" stroke="${INK}" stroke-width="6"/>` +
      `<circle cx="520" cy="640" r="150" fill="none" stroke="${INK}" stroke-width="6"/>` +
      `<path d="M 180 900 L 400 700 L 620 900 Z" fill="none" stroke="${INK}" stroke-width="6"/>`,
  ),
  "text-page": svgDoc(
    `<text x="400" y="480" text-anchor="middle" font-family="monospace" font-size="72" fill="${INK}">NOT A FACE</text>` +
      `<text x="400" y="580" text-anchor="middle" font-family="monospace" font-size="40" fill="${INK}">nothing to see here</text>`,
  ),
  smiley: svgDoc(
    `<circle cx="400" cy="520" r="240" fill="none" stroke="${INK}" stroke-width="8"/>` +
      `<circle cx="320" cy="450" r="24" fill="${INK}"/>` +
      `<circle cx="480" cy="450" r="24" fill="${INK}"/>` +
      `<path d="M 290 620 Q 400 720 510 620" fill="none" stroke="${INK}" stroke-width="8"/>`,
  ),
  // A competent generic face with no attempt at any specific suspect.
  "generic-face": svgDoc(
    `<ellipse cx="400" cy="500" rx="200" ry="260" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<path d="M 290 420 Q 330 400 370 418" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<path d="M 430 418 Q 470 400 510 420" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<ellipse cx="330" cy="455" rx="26" ry="14" fill="none" stroke="${INK}" stroke-width="4"/>` +
      `<ellipse cx="470" cy="455" rx="26" ry="14" fill="none" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M 400 470 L 392 570 Q 400 585 415 575" fill="none" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M 340 650 Q 400 675 460 650" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<path d="M 250 380 Q 400 300 550 380" fill="none" stroke="${INK}" stroke-width="6"/>` +
      `<path d="M 320 780 L 310 900 M 480 780 L 490 900" fill="none" stroke="${INK}" stroke-width="5"/>`,
  ),
};

async function ensureFixedDrawings(): Promise<void> {
  mkdirSync(DRAWINGS_DIR, { recursive: true });
  for (const [name, svg] of Object.entries(FIXED_SVGS)) {
    const file = join(DRAWINGS_DIR, `${name}.png`);
    if (existsSync(file)) continue;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(file, png);
    console.log(`  generated ${file}`);
  }
}

function fixedDrawing(name: string): () => Promise<Buffer> {
  return async () => readFileSync(join(DRAWINGS_DIR, `${name}.png`));
}

/** "Trace" a portrait: grayscale, soften, lighten — sketch-shaped truth. */
async function tracePortrait(
  portrait: Buffer,
  faint: boolean,
): Promise<Buffer> {
  let img = sharp(portrait)
    .resize(CANVAS_W, CANVAS_H, { fit: "cover" })
    .grayscale()
    .normalise();
  img = faint ? img.blur(6).linear(0.5, 128) : img.blur(1.2);
  return img.flatten({ background: PAPER }).png().toBuffer();
}

// ---------------------------------------------------------------------------

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  await ensureFixedDrawings();
  if (process.argv.includes("--drawings-only")) {
    console.log("Fixed reference drawings are in place.");
    return;
  }

  loadScriptEnv();
  const model =
    arg("--model") ?? process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL;
  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  console.log(
    `Calibrating judge — model ${model}, prompt v${JUDGE_PROMPT_VERSION}, scoring v${SCORING_VERSION}`,
  );

  // --- suspect under test + a decoy for the wrong-face check ----------------
  const { data: pool, error } = await supabase
    .from("suspects")
    .select("id, difficulty, traits, image_path")
    .eq("status", "live")
    .not("image_path", "is", null)
    .order("created_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(error.message);

  const wantedId = arg("--suspect");
  const suspect = wantedId
    ? pool?.find((s) => s.id === wantedId)
    : pool?.[0];
  if (!suspect) {
    throw new Error(
      wantedId
        ? `live suspect ${wantedId} with an image not found`
        : "no live suspects with images — run generate-suspects first",
    );
  }
  const decoy = pool?.find((s) => s.id !== suspect.id) ?? null;

  const traits = TraitSheetSchema.parse(suspect.traits);
  const difficulty = suspect.difficulty as Difficulty;
  console.log(`  suspect ${suspect.id} (${difficulty})`);

  const download = async (path: string): Promise<Buffer> => {
    const { data, error: dlError } = await supabase.storage
      .from("suspect-images")
      .download(path);
    if (dlError || !data) {
      throw new Error(`image download failed: ${dlError?.message}`);
    }
    return Buffer.from(await data.arrayBuffer());
  };
  const portrait = await download(suspect.image_path!);

  // --- reference set ---------------------------------------------------------
  const references: Reference[] = [
    { name: "blank", kind: "fixed", expect: { max: 10 }, png: fixedDrawing("blank") },
    { name: "scribble-light", kind: "fixed", expect: { max: 15 }, png: fixedDrawing("scribble-light") },
    { name: "scribble-dense", kind: "fixed", expect: { max: 15 }, png: fixedDrawing("scribble-dense") },
    { name: "shapes", kind: "fixed", expect: { max: 15 }, png: fixedDrawing("shapes") },
    { name: "text-page", kind: "fixed", expect: { max: 15 }, png: fixedDrawing("text-page") },
    { name: "smiley", kind: "fixed", expect: { max: 40 }, png: fixedDrawing("smiley") },
    { name: "generic-face", kind: "fixed", expect: { max: 55 }, png: fixedDrawing("generic-face") },
    {
      name: "traced-self",
      kind: "derived",
      expect: { min: 55 },
      png: () => tracePortrait(portrait, false),
    },
    {
      name: "traced-self-faint",
      kind: "derived",
      expect: {},
      png: () => tracePortrait(portrait, true),
    },
  ];
  if (decoy) {
    const decoyPortrait = await download(decoy.image_path!);
    references.push({
      name: "traced-other",
      kind: "derived",
      expect: {},
      png: () => tracePortrait(decoyPortrait, false),
    });
  } else {
    console.warn("  (only one live suspect — skipping the wrong-face check)");
  }

  // --- run --------------------------------------------------------------------
  const costs = new CostTracker();
  const failures: string[] = [];
  const results: Array<{
    name: string;
    kind: string;
    finalScore: number;
    weightedBase: number;
    traits: Record<string, number>;
    bestFeature: string;
    biggestMiss: string;
    caseReport: string;
    expect: Expectation;
    pass: boolean;
  }> = [];

  for (const ref of references) {
    process.stdout.write(`  judging ${ref.name} … `);
    const drawing = await ref.png();
    const { verdict, usage } = await runJudge(anthropic, model, {
      traits,
      suspectPng: new Uint8Array(portrait),
      drawingPng: new Uint8Array(drawing),
    });
    costs.addClaude(`judge (${ref.name})`, model, usage);

    const computed = computeFinalScore(verdict.traits, difficulty, false);
    const pass =
      (ref.expect.max === undefined ||
        computed.finalScore <= ref.expect.max) &&
      (ref.expect.min === undefined || computed.finalScore >= ref.expect.min);
    if (!pass) {
      failures.push(
        `${ref.name}: final ${computed.finalScore} outside ${JSON.stringify(ref.expect)}`,
      );
    }
    console.log(
      `final ${computed.finalScore} (base ${computed.weightedBase}) ${pass ? "ok" : "FAIL"}`,
    );

    results.push({
      name: ref.name,
      kind: ref.kind,
      finalScore: computed.finalScore,
      weightedBase: computed.weightedBase,
      traits: verdict.traits,
      bestFeature: verdict.bestFeature,
      biggestMiss: verdict.biggestMiss,
      caseReport: verdict.caseReport,
      expect: ref.expect,
      pass,
    });
  }

  // Likeness ordering: the right face must beat the wrong face.
  const self = results.find((r) => r.name === "traced-self");
  const other = results.find((r) => r.name === "traced-other");
  if (self && other && self.finalScore <= other.finalScore) {
    failures.push(
      `traced-self (${self.finalScore}) did not outscore traced-other ` +
        `(${other.finalScore}) — the judge is not scoring likeness`,
    );
  }

  costs.print("");

  const record = {
    at: new Date().toISOString(),
    model,
    judge_prompt_version: JUDGE_PROMPT_VERSION,
    scoring_version: SCORING_VERSION,
    suspect: { id: suspect.id, difficulty },
    decoy: decoy ? { id: decoy.id } : null,
    results,
    failures,
    cost: costs.summary(),
  };
  const outFile = join(
    CALIBRATION_DIR,
    `results-v${JUDGE_PROMPT_VERSION}-${record.at.replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\nResults written to ${outFile}`);
  logCostRecord({ kind: "judge-calibration", model, cost: record.cost.total_usd });

  if (failures.length > 0) {
    console.error(`\nCalibration FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exitCode = 1;
  } else {
    console.log("Calibration passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});