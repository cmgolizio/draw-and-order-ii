/**
 * Phase 4 acceptance checks against a RUNNING app (dev or preview):
 *
 *   npm run dev            # in one terminal (with Supabase env configured)
 *   npm run test:game-api  # in another
 *   BASE_URL=https://... npm run test:game-api
 *
 * Covers, per the build plan's acceptance criteria:
 *   - round creation never returns a suspect image (strict response
 *     allowlist; only the silhouette is signed),
 *   - ownership is enforced (someone else's anonId is rejected),
 *   - uploads are validated (non-PNG, wrong dimensions),
 *   - duplicate daily submissions are rejected,
 *   - rate limits demonstrably fire (run last — it exhausts the hourly
 *     create quota for this IP).
 *
 * Judge-burning checks are opt-in:
 *   npm run test:game-api -- --with-judge   # submits a blank canvas; must
 *                                           # score < 10 (one judge call)
 *
 * NOTE: this writes real rounds and rate-limit rows — point it at a dev
 * database, not production.
 */
import sharp from "sharp";
import { loadScriptEnv } from "./lib/script-env";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WITH_JUDGE = process.argv.includes("--with-judge");

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function createRound(
  anonId: string,
  mode: "practice" | "daily",
  difficulty?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}/api/rounds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, difficulty, anonId }),
  });
  return { status: res.status, body: await res.json() };
}

async function submitDrawing(
  roundId: string,
  anonId: string,
  drawing: Buffer | Blob,
  filename = "sketch.png",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  const blob =
    drawing instanceof Blob
      ? drawing
      : new Blob([new Uint8Array(drawing)], { type: "image/png" });
  form.set("drawing", blob, filename);
  form.set("anonId", anonId);
  form.set("usedGuide", "false");
  const res = await fetch(`${BASE_URL}/api/rounds/${roundId}/submit`, {
    method: "POST",
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

async function reveal(
  roundId: string,
  anonId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}/api/rounds/${roundId}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonId }),
  });
  return { status: res.status, body: await res.json() };
}

const blankCanvas = () =>
  sharp({
    create: {
      width: 800,
      height: 1040,
      channels: 3,
      background: "#fbf9f4",
    },
  })
    .png()
    .toBuffer();

async function main() {
  loadScriptEnv();
  console.log(`Phase 4 acceptance checks against ${BASE_URL}\n`);

  const anonId = crypto.randomUUID();
  const strangerId = crypto.randomUUID();

  // --- 1. round creation: no suspect image, ever ---------------------------
  console.log("Round creation");
  const created = await createRound(anonId, "practice", "detective");
  check("practice round opens (200)", created.status === 200, JSON.stringify(created.body));
  if (created.status !== 200) {
    console.error("\nCannot continue without a round — is the server up and the pool seeded?");
    process.exitCode = 1;
    return;
  }
  const roundId = created.body.roundId as string;

  const allowedKeys = new Set([
    "roundId",
    "mode",
    "dailyDate",
    "difficulty",
    "statement",
    "statementTeaser",
    "silhouetteUrl",
  ]);
  const extraKeys = Object.keys(created.body).filter((k) => !allowedKeys.has(k));
  check(
    "response carries only the briefing allowlist (no image fields)",
    extraKeys.length === 0,
    `unexpected keys: ${extraKeys.join(", ")}`,
  );
  const serialized = JSON.stringify(created.body);
  check(
    "no raw image_path anywhere in the response",
    !serialized.includes("image_path"),
  );
  const silhouetteUrl = created.body.silhouetteUrl as string | null;
  check(
    "any signed storage URL is the silhouette, not the portrait",
    silhouetteUrl === null || silhouetteUrl.includes("-silhouette"),
    silhouetteUrl ?? undefined,
  );

  // --- 2. ownership ----------------------------------------------------------
  console.log("Ownership");
  const blank = await blankCanvas();
  const stolen = await submitDrawing(roundId, strangerId, blank);
  check(
    "someone else's anonId cannot submit to the round (403)",
    stolen.status === 403,
    `got ${stolen.status}`,
  );
  const stolenReveal = await reveal(roundId, strangerId);
  check(
    "someone else's anonId cannot reveal the round (403)",
    stolenReveal.status === 403,
    `got ${stolenReveal.status}`,
  );

  // --- 3. upload validation ---------------------------------------------------
  console.log("Upload validation");
  const notPng = await submitDrawing(
    roundId,
    anonId,
    new Blob(["definitely not a png"], { type: "image/png" }),
  );
  check("non-PNG payload rejected (415)", notPng.status === 415, `got ${notPng.status}`);

  const tiny = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  const wrongDims = await submitDrawing(roundId, anonId, tiny);
  check(
    "wrong-dimension PNG rejected (400)",
    wrongDims.status === 400,
    `got ${wrongDims.status}`,
  );

  // --- 4. optional judge round-trip -------------------------------------------
  if (WITH_JUDGE) {
    console.log("Judge (burns one call)");
    const scored = await submitDrawing(roundId, anonId, blank);
    if (scored.status === 200) {
      const score = scored.body.score as number;
      check("blank canvas scores near zero (< 10)", score < 10, `score ${score}`);
      const dup = await submitDrawing(roundId, anonId, blank);
      check("second submission rejected (409)", dup.status === 409, `got ${dup.status}`);
    } else {
      check(
        "judge failure is honest (502/503, round stays open)",
        scored.status === 502 || scored.status === 503,
        `got ${scored.status}: ${JSON.stringify(scored.body)}`,
      );
    }
  } else {
    // Close it out via the give-up path instead.
    console.log("Forfeit (give-up path)");
    const forfeited = await reveal(roundId, anonId);
    check("forfeit reveals the suspect (200)", forfeited.status === 200, `got ${forfeited.status}`);
    check(
      "forfeit returns a signed suspect image",
      typeof forfeited.body.suspectImageUrl === "string",
    );
    check("forfeit is marked", forfeited.body.forfeited === true);
    const late = await submitDrawing(roundId, anonId, blank);
    check(
      "submitting after forfeit rejected (409)",
      late.status === 409,
      `got ${late.status}`,
    );
  }

  // --- 5. daily uniqueness -----------------------------------------------------
  console.log("Daily uniqueness");
  const daily1 = await createRound(anonId, "daily");
  if (daily1.status === 404) {
    console.log("  (no daily assigned for today — skipping; run assign-daily)");
  } else {
    check("daily round opens (200)", daily1.status === 200, JSON.stringify(daily1.body));
    const dailyRound = daily1.body.roundId as string;
    const daily2 = await createRound(anonId, "daily");
    check(
      "re-opening the unfinished daily returns the same round",
      daily2.status === 200 && daily2.body.roundId === dailyRound,
      `got ${daily2.status} / ${daily2.body.roundId}`,
    );
    await reveal(dailyRound, anonId);
    const daily3 = await createRound(anonId, "daily");
    check(
      "finished daily cannot be replayed (409 daily_already_played)",
      daily3.status === 409 && daily3.body.code === "daily_already_played",
      `got ${daily3.status} / ${daily3.body.code}`,
    );
  }

  // --- 6. rate limits (LAST — exhausts this IP's hourly create quota) ----------
  console.log("Rate limits (this exhausts the hourly create quota — last on purpose)");
  let sawLimit = false;
  for (let i = 0; i < 40; i++) {
    const res = await createRound(crypto.randomUUID(), "practice");
    if (res.status === 429) {
      sawLimit = true;
      check(
        "429 carries the in-theme message",
        typeof res.body.error === "string" &&
          (res.body.error as string).toLowerCase().includes("detective"),
        String(res.body.error),
      );
      break;
    }
    if (res.status !== 200) {
      check("rate-limit loop hit an unexpected status", false, `got ${res.status}`);
      break;
    }
  }
  check("create rate limit fires within 40 attempts", sawLimit);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});