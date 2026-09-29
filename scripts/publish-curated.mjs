/** Offline only. Default is a dry-run. Never retires, overwrites or assigns dailies. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { CASES } from "../src/lib/play/cases.js";
import { loadScriptEnv, requireEnv } from "./lib/script-env.ts";
loadScriptEnv();
const write = process.argv.includes("--publish");
const review = JSON.parse(await readFile("content/cases/review.json", "utf8"));
const admin = write
  ? createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SECRET_KEY"),
    )
  : null;
for (const [i, c] of CASES.entries()) {
  const bytes = await readFile(`content/cases/${c.id}.png`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (review[c.id]?.sha256 !== sha || review[c.id]?.status !== "reviewed")
    throw new Error(`Review missing/stale: ${c.id}`);
  const id = `d0a00002-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
  console.log(
    `${write ? "Publishing for review" : "Dry run"}: ${c.id}, ${id}, ${bytes.length} bytes`,
  );
  if (!admin) continue;
  const { data: existing, error: lookup } = await admin
    .from("suspects")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (lookup) throw lookup;
  if (existing) {
    console.log("Already exists; left unchanged.");
    continue;
  }
  const image_path = `curated/v2/${sha}.png`;
  const { error: upload } = await admin.storage
    .from("suspect-images")
    .upload(image_path, bytes, { contentType: "image/png", upsert: false });
  if (upload && !String(upload.message).includes("already exists"))
    throw upload;
  const { error } = await admin
    .from("suspects")
    .insert({
      id,
      difficulty: "detective",
      statement: c.witnesses.map((w) => `${w.name}: ${w.text}`).join("\n\n"),
      statement_teaser: c.title,
      traits: c,
      image_path,
      silhouette_path: null,
      status: "review",
      model_info: { content_version: 2, art_sha256: sha, review: review[c.id] },
    });
  if (error) throw error;
}
