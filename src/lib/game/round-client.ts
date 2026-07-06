/**
 * Client half of the round lifecycle (Phases 4–6), shared by the practice and
 * daily flows: talk to the game API, stash the result payload for
 * /results/[roundId], and mirror finished rounds into local history (Phase 5).
 *
 * Signed-in players are identified by their auth cookie; only anonymous
 * players present (and mint) an anonId — so post-migration accounts never
 * grow a fresh anonymous identity as a side effect of playing.
 */
import type {
  ApiErrorBody,
  CreateRoundResponse,
  RevealRoundResponse,
  RoundResultPayload,
  SubmitRoundResponse,
} from "@/lib/game/api-types";
import { RESULT_STORAGE_PREFIX } from "@/lib/game/api-types";
import { getOrCreateAnonId, recordLocalRound } from "@/lib/game/anon-id";
import type { Difficulty } from "@/lib/game/trait-sheet";
import type { DrawBriefing } from "@/lib/draw/demoCase";
import { createClient } from "@/lib/supabase/client";

export class RoundApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
    this.name = "RoundApiError";
  }
}

async function toApiError(
  res: Response,
  fallback: string,
): Promise<RoundApiError> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    return new RoundApiError(body.error || fallback, body.code ?? null, res.status);
  } catch {
    return new RoundApiError(fallback, null, res.status);
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof RoundApiError ? error.message : fallback;
}

/**
 * The identity to attach to a request: nothing when a session cookie will
 * vouch for us, a (possibly fresh) anonId otherwise.
 */
async function anonIdForRequest(): Promise<string | undefined> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    if (data.session) return undefined;
  } catch {
    // No Supabase env — anonymous play is all there is.
  }
  return getOrCreateAnonId();
}

export async function openRound(body: {
  mode: "practice" | "daily";
  difficulty?: Difficulty;
  turnstileToken?: string;
}): Promise<CreateRoundResponse> {
  const res = await fetch("/api/rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, anonId: await anonIdForRequest() }),
  });
  if (!res.ok) {
    throw await toApiError(res, "Couldn't reach the precinct. Try again.");
  }
  return (await res.json()) as CreateRoundResponse;
}

export type SubmitRoundArgs = {
  /** PNG data-URL at exactly 800x1040. */
  dataUrl: string;
  /** Serialized stroke log, or null when it blew the 200KB cap. */
  strokeLog: string | null;
  usedGuide: boolean;
};

/** Submit for judging. Resolves to the roundId once the result is stashed. */
export async function submitRound(
  briefing: DrawBriefing,
  args: SubmitRoundArgs,
): Promise<string> {
  if (!briefing.roundId) {
    throw new RoundApiError("No open case to file against.", null, 0);
  }
  const drawing = await (await fetch(args.dataUrl)).blob();
  const form = new FormData();
  form.set("drawing", drawing, "sketch.png");
  form.set("usedGuide", String(args.usedGuide));
  if (args.strokeLog) form.set("strokeLog", args.strokeLog);
  const anonId = await anonIdForRequest();
  if (anonId) form.set("anonId", anonId);

  const res = await fetch(`/api/rounds/${briefing.roundId}/submit`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw await toApiError(
      res,
      "The examiner couldn't score the sketch. It's saved — try again.",
    );
  }
  const data = (await res.json()) as SubmitRoundResponse;
  storeResult({
    roundId: data.roundId,
    mode: briefing.mode,
    difficulty: briefing.difficulty,
    dailyDate: briefing.dailyDate,
    statement: briefing.statement,
    forfeited: false,
    score: data.score,
    breakdown: data.breakdown,
    suspectImageUrl: data.suspectImageUrl,
    drawingDataUrl: args.dataUrl,
    durationSeconds: data.durationSeconds,
  });
  recordLocalRound({
    roundId: data.roundId,
    mode: briefing.mode,
    difficulty: briefing.difficulty,
    dailyDate: briefing.dailyDate,
    score: data.score,
    forfeited: false,
    createdAt: new Date().toISOString(),
  });
  return data.roundId;
}

/** The give-up path. Resolves to the roundId once the result is stashed. */
export async function forfeitRound(
  briefing: DrawBriefing,
  drawingDataUrl: string | null,
): Promise<string> {
  if (!briefing.roundId) {
    throw new RoundApiError("No open case to close.", null, 0);
  }
  const res = await fetch(`/api/rounds/${briefing.roundId}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonId: await anonIdForRequest() }),
  });
  if (!res.ok) {
    throw await toApiError(res, "Couldn't close the case. Try again.");
  }
  const data = (await res.json()) as RevealRoundResponse;
  storeResult({
    roundId: data.roundId,
    mode: briefing.mode,
    difficulty: briefing.difficulty,
    dailyDate: briefing.dailyDate,
    statement: briefing.statement,
    forfeited: data.forfeited,
    score: null,
    breakdown: null,
    suspectImageUrl: data.suspectImageUrl,
    drawingDataUrl,
    durationSeconds: null,
  });
  recordLocalRound({
    roundId: data.roundId,
    mode: briefing.mode,
    difficulty: briefing.difficulty,
    dailyDate: briefing.dailyDate,
    score: null,
    forfeited: data.forfeited,
    createdAt: new Date().toISOString(),
  });
  return data.roundId;
}

function storeResult(payload: RoundResultPayload) {
  try {
    window.sessionStorage.setItem(
      RESULT_STORAGE_PREFIX + payload.roundId,
      JSON.stringify(payload),
    );
  } catch {
    // Storage full or unavailable — the results page shows its fallback.
  }
}