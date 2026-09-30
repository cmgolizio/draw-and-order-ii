import sharp from "sharp";
import { CaseSchema } from "@/lib/play/schema";
import { runCaseJudge, CASE_JUDGE_VERSION } from "@/lib/play/judge";
import { verifyTurnstile } from "@/lib/server/turnstile";
import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { judgeModel, serverEnv } from "@/lib/env";
import type {
  ScoreBreakdownPayload,
  SubmitRoundResponse,
} from "@/lib/game/api-types";
import {
  DEFAULT_JUDGE_MODEL,
  JUDGE_PROMPT_VERSION,
  runJudge,
  type JudgeResult,
} from "@/lib/game/judge";
import { estimateJudgeCostUsd } from "@/lib/game/judge-cost";
import { computeFinalScore, SCORING_VERSION } from "@/lib/game/scoring";
import { TraitSheetSchema } from "@/lib/game/trait-sheet";
import { apiError, withRouteErrors } from "@/lib/server/api";
import { errorString, logError, logEvent } from "@/lib/server/log";
import {
  identityRateKey,
  ownsRound,
  requestIp,
  resolveIdentity,
} from "@/lib/server/identity";
import { hitJudgeBudget, hitLimit, LIMITS } from "@/lib/server/rate-limit";
import { readPngDimensions } from "@/lib/server/png";
import { createAdminClient } from "@/lib/supabase/admin";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "@/lib/draw/types";
import { parseStrokeLog, STROKE_LOG_MAX_BYTES } from "@/lib/draw/strokeLog";

/**
 * POST /api/rounds/[id]/submit — round lifecycle step 2 (Phase 4).
 *
 * Multipart: the drawing PNG (+ optional stroke log). Validates ownership,
 * uploads the drawing, fetches the suspect image via the service role, runs
 * the single-call judge, computes the score IN OUR CODE, and returns full
 * results plus a short-lived signed suspect-image URL — submission = reveal.
 *
 * If the judge call fails the round STAYS OPEN (drawing kept) and the player
 * gets an honest error and a retry. A fake score is never returned.
 */

export const maxDuration = 60;

const MAX_DRAWING_BYTES = 2 * 1024 * 1024;
const REVEAL_URL_TTL_SECONDS = 600;

const FieldsSchema = z.object({
  anonId: z.uuid().optional(),
  usedGuide: z.enum(["true", "false"]).optional(),
  turnstileToken: z.string().min(1).max(2048).optional(),
});

export const POST = withRouteErrors("rounds.submit", submitRound);

async function submitRound(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;
  if (!z.uuid().safeParse(roundId).success) {
    return apiError(400, "bad_round_id", "That case number doesn't parse.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "bad_request", "Expected a multipart submission.");
  }
  const fields = FieldsSchema.safeParse({
    anonId: stringField(form, "anonId"),
    usedGuide: stringField(form, "usedGuide"),
    turnstileToken: stringField(form, "turnstileToken"),
  });
  if (!fields.success) {
    return apiError(400, "bad_request", "Malformed submission fields.");
  }

  const identity = await resolveIdentity(fields.data.anonId);
  if (!identity) {
    return apiError(401, "identity_required", "No badge, no submission.");
  }

  const admin = createAdminClient();

  // --- the round must exist, be theirs, and still be open -------------------
  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select(
      "id, user_id, anon_id, suspect_id, mode, daily_date, revealed, final_score, created_at",
    )
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) {
    return apiError(500, "server_error", "Records room is jammed. Try again.");
  }
  if (!round) {
    return apiError(404, "case_file_missing", "No such case file.");
  }
  if (!ownsRound(identity, round)) {
    return apiError(
      403,
      "not_your_case",
      "That's not your case file, detective.",
    );
  }
  if (round.final_score !== null || round.revealed) {
    return apiError(
      409,
      "round_closed",
      "This case is already closed — one sketch per case.",
    );
  }

  // --- validate the drawing: PNG only, capped, exact export dimensions ------
  const file = form.get("drawing");
  if (!(file instanceof File)) {
    return apiError(400, "drawing_missing", "No sketch attached.");
  }
  if (file.size > MAX_DRAWING_BYTES) {
    return apiError(413, "drawing_too_large", "Sketch exceeds the 2MB limit.");
  }
  let drawingBytes = new Uint8Array(await file.arrayBuffer());
  const dims = readPngDimensions(drawingBytes);
  if (!dims) {
    return apiError(415, "drawing_not_png", "Sketches must be PNG.");
  }
  if (dims.width !== CANVAS_WIDTH || dims.height !== CANVAS_HEIGHT) {
    return apiError(
      400,
      "drawing_bad_dimensions",
      `Sketches are ${CANVAS_WIDTH}x${CANVAS_HEIGHT}; got ${dims.width}x${dims.height}.`,
    );
  }

  try {
    drawingBytes = new Uint8Array(
      await sharp(drawingBytes, {
        limitInputPixels: CANVAS_WIDTH * CANVAS_HEIGHT,
      })
        .png()
        .toBuffer(),
    );
  } catch {
    return apiError(
      400,
      "drawing_not_png",
      "The PNG could not be decoded. Your sketch has not been judged.",
    );
  }

  // Optional stroke log — replay data, dropped silently when oversized/broken.
  let strokeData: unknown = null;
  const strokeLogRaw = form.get("strokeLog");
  if (
    typeof strokeLogRaw === "string" &&
    strokeLogRaw.length > 0 &&
    strokeLogRaw.length <= STROKE_LOG_MAX_BYTES
  ) {
    try {
      strokeData = parseStrokeLog(JSON.parse(strokeLogRaw));
    } catch {
      strokeData = null;
    }
  }

  // --- rate limits: hourly per IP + identity, daily per identity ------------
  const ip = requestIp(request);
  const identityKey = identityRateKey(identity);
  const hourlyOk =
    (await hitLimit(admin, LIMITS.submitPerIp, ip)) &&
    (await hitLimit(admin, LIMITS.submitPerIdentity, identityKey));
  if (!hourlyOk) {
    return apiError(
      429,
      "rate_limited",
      "Slow down, detective — the sketch desk takes ten an hour, tops.",
    );
  }
  const dailyLimit =
    identity.kind === "user"
      ? LIMITS.submitAuthedPerDay
      : LIMITS.submitAnonPerDay;
  if (!(await hitLimit(admin, dailyLimit, identityKey))) {
    return apiError(
      429,
      "daily_cap",
      "The precinct's sketch budget is spent for today, detective.",
    );
  }

  // --- fetch the truth: trait sheet + suspect image (service role only) -----
  const { data: suspect, error: suspectError } = await admin
    .from("suspects")
    .select("id, difficulty, traits, image_path")
    .eq("id", round.suspect_id)
    .maybeSingle();
  if (suspectError || !suspect?.image_path) {
    return apiError(
      500,
      "case_file_corrupt",
      "The case file is damaged. This one's on us.",
    );
  }
  const traits = TraitSheetSchema.safeParse(suspect.traits);
  const caseContent = CaseSchema.safeParse(suspect.traits);
  if (!traits.success && !caseContent.success) {
    return apiError(
      500,
      "case_file_corrupt",
      "The case file is damaged. This one's on us.",
    );
  }
  const { data: suspectBlob, error: downloadError } = await admin.storage
    .from("suspect-images")
    .download(suspect.image_path);
  if (downloadError || !suspectBlob) {
    return apiError(
      500,
      "case_file_corrupt",
      "The case file is damaged. This one's on us.",
    );
  }
  const suspectBytes = new Uint8Array(await suspectBlob.arrayBuffer());

  // --- persist the drawing BEFORE judging, so a judge failure loses nothing.
  // Retries re-upload harmlessly (upsert) to the same path.
  const drawingPath =
    identity.kind === "user"
      ? `${identity.id}/${roundId}.png`
      : `anon/${identity.id}/${roundId}.png`;
  const { error: uploadError } = await admin.storage
    .from("drawings")
    .upload(drawingPath, drawingBytes, {
      contentType: "image/png",
      upsert: true,
    });
  if (uploadError) {
    return apiError(
      500,
      "server_error",
      "Couldn't file the sketch. Try again.",
    );
  }
  const { error: drawingSaveError } = await admin
    .from("rounds")
    .update({ drawing_path: drawingPath, stroke_data: strokeData })
    .eq("id", roundId);
  if (drawingSaveError)
    return apiError(
      500,
      "server_error",
      "Could not save the sketch record. Try again.",
    );

  // Verification belongs at the costly action, after the drawing is preserved.
  const verification = await verifyTurnstile(fields.data.turnstileToken, ip);
  if (!verification.ok)
    return apiError(403, "turnstile_failed", verification.message);
  if (caseContent.success && process.env.CASE_JUDGE_CALIBRATED !== "true") {
    return apiError(
      503,
      "judge_not_calibrated",
      "Likeness scoring for this new case is not ready. Reveal without a score, or keep your sketch and retry later.",
    );
  }

  // --- per-day global spend circuit breaker ---------------------------------
  if (!(await hitJudgeBudget(admin))) {
    return apiError(
      503,
      "precinct_closed",
      "Precinct's closed, detective — today's forensic budget is spent. Come back tomorrow.",
    );
  }

  // --- the judge: one Claude vision call, honest failure ---------------------
  const model = judgeModel(DEFAULT_JUDGE_MODEL);
  let judged: JudgeResult;
  let caseMatch: {
    score: number;
    features: { id: string; label: string; score: number }[];
    feedback: string;
  } | null = null;
  try {
    const anthropic = new Anthropic({
      apiKey: serverEnv("ANTHROPIC_API_KEY"),
      maxRetries: 0,
      timeout: 45000,
    });
    if (caseContent.success) {
      const outcome = await runCaseJudge(anthropic, model, {
        caseContent: caseContent.data,
        suspectPng: suspectBytes,
        drawingPng: drawingBytes,
      });
      caseMatch = outcome.match;
      judged = { usage: outcome.usage } as JudgeResult;
    } else {
      judged = await runJudge(anthropic, model, {
        traits: traits.data!,
        suspectPng: suspectBytes,
        drawingPng: drawingBytes,
      });
    }
  } catch (error) {
    logError("judge_failed", { roundId, model, error: errorString(error) });
    return apiError(
      502,
      "judge_unavailable",
      "The forensic examiner stepped out — your sketch is filed. Try scoring it again in a moment.",
    );
  }
  // Per-call cost logging (Phase 8): spend per round, greppable by event.
  const judgeCostUsd = estimateJudgeCostUsd(model, judged.usage);
  logEvent("judge_scored", {
    roundId,
    model,
    input_tokens: judged.usage.input_tokens,
    output_tokens: judged.usage.output_tokens,
    estimated_cost_usd: judgeCostUsd,
  });

  // --- final score is computed HERE, from tunable weights -------------------
  const usedGuide = fields.data.usedGuide === "true";
  const computed = caseMatch
    ? {
        finalScore: caseMatch.score,
        weightedBase: caseMatch.score,
        multipliers: { difficulty: 1, guide: 1 },
      }
    : computeFinalScore(judged.verdict.traits, suspect.difficulty, usedGuide);
  const durationSeconds = Math.max(
    0,
    Math.round((Date.now() - new Date(round.created_at).getTime()) / 1000),
  );

  const breakdown: ScoreBreakdownPayload | null = caseMatch
    ? null
    : {
        traits: judged.verdict.traits,
        caseReport: judged.verdict.caseReport,
        bestFeature: judged.verdict.bestFeature,
        biggestMiss: judged.verdict.biggestMiss,
        usedGuide,
        weightedBase: computed.weightedBase,
        multipliers: computed.multipliers,
      };

  const { error: scoreError } = await admin
    .from("rounds")
    .update({
      final_score: computed.finalScore,
      score_breakdown: {
        ...breakdown,
        ...(caseMatch ? { version: 2, caseMatch } : {}),
        used_guide: usedGuide, // schema-documented key, kept alongside
        scoring_version: caseMatch ? CASE_JUDGE_VERSION : SCORING_VERSION,
        judge: {
          model,
          prompt_version: caseMatch ? CASE_JUDGE_VERSION : JUDGE_PROMPT_VERSION,
          input_tokens: judged.usage.input_tokens,
          output_tokens: judged.usage.output_tokens,
          estimated_cost_usd: judgeCostUsd,
        },
      },
      duration_seconds: durationSeconds,
      revealed: true,
    })
    .eq("id", roundId);
  if (scoreError) {
    return apiError(
      500,
      "server_error",
      "Couldn't file the report. Try again.",
    );
  }
  logEvent("round_scored", {
    roundId,
    mode: round.mode,
    difficulty: suspect.difficulty,
    score: computed.finalScore,
    usedGuide,
    durationSeconds,
  });

  // --- submission = reveal: sign the suspect image, short-lived -------------
  const { data: signed } = await admin.storage
    .from("suspect-images")
    .createSignedUrl(suspect.image_path, REVEAL_URL_TTL_SECONDS);

  const response: SubmitRoundResponse = {
    roundId,
    score: computed.finalScore,
    breakdown,
    ...(caseMatch
      ? {
          caseMatch,
          caseContent: caseContent.success
            ? {
                name: caseContent.data.name,
                reaction: caseContent.data.reaction,
              }
            : undefined,
        }
      : {}),
    suspectImageUrl: signed?.signedUrl ?? null,
    durationSeconds,
  };
  return Response.json(response);
}

function stringField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
