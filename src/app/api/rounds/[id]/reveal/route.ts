import { CaseSchema } from "@/lib/play/schema";
import { readPngDimensions } from "@/lib/server/png";
import { parseStrokeLog, STROKE_LOG_MAX_BYTES } from "@/lib/draw/strokeLog";
import sharp from "sharp";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { RevealRoundResponse } from "@/lib/game/api-types";
import { apiError, withRouteErrors } from "@/lib/server/api";
import {
  identityRateKey,
  ownsRound,
  resolveIdentity,
} from "@/lib/server/identity";
import { hitLimit } from "@/lib/server/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/rounds/[id]/reveal — the give-up path (Phase 4, step 3).
 *
 * Marks the round revealed + forfeited (score stays null, so forfeits never
 * hit the leaderboard) and returns a short-lived signed suspect-image URL.
 * Idempotent for already-closed rounds: re-signs the URL so a results page
 * refresh keeps working.
 */

const REVEAL_URL_TTL_SECONDS = 600;
const REVEALS_PER_HOUR = {
  bucket: "reveal-id",
  windowSeconds: 3600,
  max: 30,
};

const BodySchema = z.object({ anonId: z.uuid().optional() });

export const POST = withRouteErrors("rounds.reveal", revealRound);

async function revealRound(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: roundId } = await params;
  if (!z.uuid().safeParse(roundId).success) {
    return apiError(400, "bad_round_id", "That case number doesn't parse.");
  }

  let json: unknown = {};
  let drawing: File | null = null;
  let strokeData: unknown = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      json = { anonId: form.get("anonId") || undefined };
      const file = form.get("drawing");
      drawing = file instanceof File ? file : null;
      const raw = form.get("strokeLog");
      if (typeof raw === "string" && raw.length <= STROKE_LOG_MAX_BYTES) {
        try {
          strokeData = parseStrokeLog(JSON.parse(raw));
        } catch {
          /* optional replay */
        }
      }
    } else {
      json = await request.json();
    }
  } catch {
    // Empty body is fine — authed players don't need to send anything.
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "bad_request", "Malformed request body.");
  }

  const identity = await resolveIdentity(parsed.data.anonId);
  if (!identity) {
    return apiError(401, "identity_required", "No badge, no case file.");
  }

  const admin = createAdminClient();

  if (!(await hitLimit(admin, REVEALS_PER_HOUR, identityRateKey(identity)))) {
    return apiError(
      429,
      "rate_limited",
      "Slow down, detective — the evidence locker needs a breather.",
    );
  }

  const { data: round, error: roundError } = await admin
    .from("rounds")
    .select("id, user_id, anon_id, suspect_id, revealed, final_score")
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

  if (!round.revealed && drawing) {
    if (drawing.size > 2 * 1024 * 1024)
      return apiError(
        413,
        "drawing_too_large",
        "Sketch exceeds the 2MB limit.",
      );
    let bytes = Buffer.from(await drawing.arrayBuffer());
    const dims = readPngDimensions(bytes);
    if (!dims || dims.width !== 800 || dims.height !== 1040)
      return apiError(
        400,
        "drawing_bad_dimensions",
        "Expected an 800 × 1040 PNG.",
      );
    try {
      bytes = await sharp(bytes, { limitInputPixels: 800 * 1040 })
        .png()
        .toBuffer();
    } catch {
      return apiError(400, "drawing_not_png", "The sketch could not be read.");
    }
    const drawingPath =
      identity.kind === "user"
        ? `${identity.id}/${roundId}.png`
        : `anon/${identity.id}/${roundId}.png`;
    const { error: uploadError } = await admin.storage
      .from("drawings")
      .upload(drawingPath, bytes, { contentType: "image/png", upsert: true });
    if (uploadError)
      return apiError(
        500,
        "server_error",
        "Could not save the sketch. Your drawing is still in this tab.",
      );
    const { error: saveError } = await admin
      .from("rounds")
      .update({ drawing_path: drawingPath, stroke_data: strokeData })
      .eq("id", roundId);
    if (saveError)
      return apiError(
        500,
        "server_error",
        "Could not save the sketch record. Try again.",
      );
  }

  if (!round.revealed) {
    const { error } = await admin
      .from("rounds")
      .update({ revealed: true, score_breakdown: { forfeited: true } })
      .eq("id", roundId);
    if (error) {
      return apiError(
        500,
        "server_error",
        "Couldn't close the case. Try again.",
      );
    }
  }

  const { data: suspect } = await admin
    .from("suspects")
    .select("image_path, traits")
    .eq("id", round.suspect_id)
    .maybeSingle();
  if (!suspect?.image_path) {
    return apiError(
      500,
      "case_file_corrupt",
      "The case file is damaged. This one's on us.",
    );
  }
  const { data: signed } = await admin.storage
    .from("suspect-images")
    .createSignedUrl(suspect.image_path, REVEAL_URL_TTL_SECONDS);

  const content = CaseSchema.safeParse(suspect.traits);
  const response: RevealRoundResponse = {
    roundId,
    forfeited: round.final_score === null,
    ...(content.success
      ? {
          caseContent: {
            name: content.data.name,
            reaction: content.data.reaction,
            features: content.data.features.map((f) => ({
              label: f.label,
              description: f.description,
            })),
          },
        }
      : {}),
    suspectImageUrl: signed?.signedUrl ?? null,
  };
  return Response.json(response);
}
