/**
 * Append-only compressed stroke record (Phase 3, step 4) — feeds the Phase 7
 * replay feature. Capped at ~200KB serialized; past the cap the log is
 * dropped, never the drawing.
 *
 * Compression is quantization, not gzip: coordinates to 0.1px ints,
 * pressure to 0-99, per-point time as ms deltas — compact and still
 * perfectly replayable.
 */
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PENCIL_GRADES,
  type PencilGrade,
  type Stroke,
} from "./types";

export const STROKE_LOG_VERSION = 1;
export const STROKE_LOG_MAX_BYTES = 200_000;

type CompressedStroke = {
  /** tool: 0 pencil, 1 eraser */
  t: 0 | 1;
  g: string;
  s: number;
  /** 1 when pressure was simulated from velocity */
  sim: 0 | 1;
  /** ms since session start */
  at: number;
  /** [x*10, y*10, pressure*100, dt-ms] per point (x/y rounded) */
  p: [number, number, number, number][];
};

export type StrokeLog = {
  v: number;
  w: number;
  h: number;
  strokes: CompressedStroke[];
};

function compressStroke(stroke: Stroke): CompressedStroke {
  let lastT = 0;
  return {
    t: stroke.tool === "eraser" ? 1 : 0,
    g: stroke.grade,
    s: stroke.size,
    sim: stroke.simulatePressure ? 1 : 0,
    at: Math.round(stroke.startedAt),
    p: stroke.points.map(([x, y, pressure, t]) => {
      const dt = Math.max(0, Math.round(t - lastT));
      lastT = t;
      return [
        Math.round(x * 10),
        Math.round(y * 10),
        Math.round(Math.min(1, Math.max(0, pressure)) * 100),
        dt,
      ];
    }),
  };
}

/**
 * Serialize the session's strokes; returns null when the record would blow
 * the cap (the drawing itself is unaffected — graceful degradation).
 */
export function serializeStrokeLog(strokes: Stroke[]): string | null {
  const log: StrokeLog = {
    v: STROKE_LOG_VERSION,
    w: CANVAS_WIDTH,
    h: CANVAS_HEIGHT,
    strokes: strokes.map(compressStroke),
  };
  const json = JSON.stringify(log);
  if (json.length > STROKE_LOG_MAX_BYTES) return null;
  return json;
}

/* ---------------------------------------------------------------------------
 * The read side (Phase 7 replay): rounds.stroke_data arrives as untrusted
 * jsonb, so it is structurally validated before the results page animates it.
 * ------------------------------------------------------------------------- */

function isPoint(value: unknown): value is [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

function isCompressedStroke(value: unknown): value is CompressedStroke {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    (s.t === 0 || s.t === 1) &&
    typeof s.g === "string" &&
    (PENCIL_GRADES as readonly string[]).includes(s.g) &&
    typeof s.s === "number" &&
    Number.isFinite(s.s) &&
    (s.sim === 0 || s.sim === 1) &&
    typeof s.at === "number" &&
    Array.isArray(s.p) &&
    s.p.every(isPoint)
  );
}

/** Validate a stored stroke log; null when malformed or from a future version. */
export function parseStrokeLog(value: unknown): StrokeLog | null {
  if (typeof value !== "object" || value === null) return null;
  const log = value as Record<string, unknown>;
  if (log.v !== STROKE_LOG_VERSION) return null;
  if (log.w !== CANVAS_WIDTH || log.h !== CANVAS_HEIGHT) return null;
  if (!Array.isArray(log.strokes) || !log.strokes.every(isCompressedStroke)) {
    return null;
  }
  return { v: STROKE_LOG_VERSION, w: CANVAS_WIDTH, h: CANVAS_HEIGHT, strokes: log.strokes };
}

/** Inverse of compressStroke: back to renderable strokes for the replay. */
export function decompressStrokeLog(log: StrokeLog): Stroke[] {
  return log.strokes.map((s, index) => {
    let t = 0;
    return {
      id: index + 1,
      tool: s.t === 1 ? "eraser" : "pencil",
      grade: s.g as PencilGrade,
      size: s.s,
      simulatePressure: s.sim === 1,
      startedAt: s.at,
      points: s.p.map(([x, y, pressure, dt]) => {
        t += dt;
        return [x / 10, y / 10, pressure / 100, t];
      }),
    };
  });
}