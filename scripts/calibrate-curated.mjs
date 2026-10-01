/** Explicit paid offline calibration. No calls unless --run is passed. */
import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { CASES } from "../src/lib/play/cases.js";
import { runCaseJudge, CASE_JUDGE_VERSION } from "../src/lib/play/judge.js";
import { loadScriptEnv, requireEnv } from "./lib/script-env.ts";
import { z } from "zod";
loadScriptEnv();
const file = process.argv.find((a) => a.startsWith("--manifest="))?.slice(11);
if (!file)
  throw new Error(
    "Supply --manifest=path.json; see docs/classic-gameplay-verification.md",
  );
const schema = z.array(
  z.object({
    caseId: z.enum(["moth", "maven", "teapot"]),
    kind: z.enum([
      "blank",
      "scribble",
      "wrong",
      "rough-finger",
      "rough-mouse",
      "good",
      "monochrome",
    ]),
    file: z.string().min(1),
    min: z.number().min(0).max(100),
    max: z.number().min(0).max(100),
  }),
);
const fixtures = schema.parse(JSON.parse(await readFile(file, "utf8")));
for (const c of CASES)
  for (const kind of [
    "blank",
    "scribble",
    "wrong",
    "rough-finger",
    "rough-mouse",
    "good",
    "monochrome",
  ])
    if (!fixtures.some((f) => f.caseId === c.id && f.kind === kind))
      throw new Error(`Missing ${c.id}/${kind}`);
for (const f of fixtures) await readFile(f.file);
if (!process.argv.includes("--run")) {
  console.log(
    `Validated ${fixtures.length} fixtures. --run makes ${fixtures.length} paid judge calls; no retries. Review provider/model pricing before running.`,
  );
  process.exit(0);
}
const model = requireEnv("JUDGE_MODEL");
const client = new Anthropic({
  apiKey: requireEnv("ANTHROPIC_API_KEY"),
  maxRetries: 0,
  timeout: 45000,
});
const results = [];
for (const f of fixtures) {
  const original = CASES.find((c) => c.id === f.caseId);
  const c =
    f.kind === "monochrome"
      ? { ...original, drawingMode: "monochrome" }
      : original;
  const result = await runCaseJudge(client, model, {
    caseContent: c,
    suspectPng: await readFile(`content/cases/${c.id}.png`),
    drawingPng: await readFile(f.file),
  });
  results.push({
    ...f,
    ...result,
    pass: result.match.score >= f.min && result.match.score <= f.max,
  });
}
for (const c of CASES) {
  const rows = results.filter((r) => r.caseId === c.id);
  const wrong = rows.find((r) => r.kind === "wrong");
  for (const r of rows.filter((r) =>
    ["rough-finger", "rough-mouse", "good"].includes(r.kind),
  ))
    r.pass &&= r.match.score > wrong.match.score;
  for (const r of rows.filter((r) => ["blank", "scribble"].includes(r.kind)))
    r.pass &&= r.match.score < 10;
}
const output = {
  version: CASE_JUDGE_VERSION,
  model,
  at: new Date().toISOString(),
  passed: results.every((r) => r.pass),
  results,
};
await writeFile(
  "scripts/calibration/curated-results.json",
  JSON.stringify(output, null, 2) + "\n",
);
if (!output.passed) process.exitCode = 1;
