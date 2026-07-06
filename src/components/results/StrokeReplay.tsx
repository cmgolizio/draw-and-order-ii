"use client";

/**
 * Stroke replay (Phase 7): animates the sketch start-to-finish from the
 * stroke log stored at submit time. Renders on a plain 2D canvas — the
 * heavyweight Konva stack stays on the draw page.
 *
 * Timing: strokes play back at their recorded pace with idle gaps compressed
 * to a beat, and the whole performance is time-scaled to fit a watchable
 * window. Replay is user-initiated, so it also runs under reduced motion.
 */
import { useEffect, useMemo, useRef } from "react";
import { decompressStrokeLog, type StrokeLog } from "@/lib/draw/strokeLog";
import { strokeToPathData } from "@/lib/draw/strokes";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRADE_VALUE,
  INK_COLOR,
  PAPER_COLOR,
  type Stroke,
} from "@/lib/draw/types";

const MAX_REPLAY_MS = 14_000;
const INTER_STROKE_GAP_MS = 140;
const MAX_STROKE_MS = 2_500;

type TimedStroke = {
  stroke: Stroke;
  /** Replay-timeline start, after gap compression and time scaling. */
  start: number;
  duration: number;
  /** Recorded duration, for mapping playhead -> recorded point times. */
  recorded: number;
};

function buildTimeline(log: StrokeLog): { strokes: TimedStroke[]; total: number } {
  const strokes = decompressStrokeLog(log);
  let cursor = 0;
  const timed: TimedStroke[] = strokes.map((stroke) => {
    const recorded = Math.max(1, stroke.points[stroke.points.length - 1]?.[3] ?? 1);
    const duration = Math.min(recorded, MAX_STROKE_MS);
    const entry = { stroke, start: cursor, duration, recorded };
    cursor += duration + INTER_STROKE_GAP_MS;
    return entry;
  });
  const raw = Math.max(1, cursor - INTER_STROKE_GAP_MS);
  const scale = Math.min(1, MAX_REPLAY_MS / raw);
  for (const entry of timed) {
    entry.start *= scale;
    entry.duration *= scale;
  }
  return { strokes: timed, total: raw * scale };
}

function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  upToRecordedMs: number | null,
): void {
  const points =
    upToRecordedMs === null
      ? stroke.points
      : stroke.points.filter((p) => p[3] <= upToRecordedMs);
  if (points.length === 0) return;
  const data = strokeToPathData({ ...stroke, points });
  if (!data) return;
  ctx.globalCompositeOperation =
    stroke.tool === "eraser" ? "destination-out" : "source-over";
  ctx.globalAlpha = stroke.tool === "eraser" ? 1 : GRADE_VALUE[stroke.grade];
  ctx.fillStyle = INK_COLOR;
  ctx.fill(new Path2D(data));
}

export function StrokeReplay({
  strokeLog,
  onDone,
}: {
  strokeLog: StrokeLog;
  /** Fires when the performance finishes (the final frame stays painted). */
  onDone?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeline = useMemo(() => buildTimeline(strokeLog), [strokeLog]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Finished strokes accumulate here so each frame is one drawImage + the
    // in-progress stroke, not a full repaint of the whole history.
    const settled = document.createElement("canvas");
    settled.width = CANVAS_WIDTH;
    settled.height = CANVAS_HEIGHT;
    const settledCtx = settled.getContext("2d")!;

    let raf = 0;
    let settledCount = 0;
    let finished = false;
    const startedAt = performance.now();

    function frame(now: number) {
      if (!ctx) return;
      const playhead = now - startedAt;

      while (
        settledCount < timeline.strokes.length &&
        playhead >= timeline.strokes[settledCount].start + timeline.strokes[settledCount].duration
      ) {
        paintStroke(settledCtx, timeline.strokes[settledCount].stroke, null);
        settledCount++;
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(settled, 0, 0);

      const current = timeline.strokes[settledCount];
      if (current && playhead >= current.start) {
        const progress = (playhead - current.start) / current.duration;
        paintStroke(ctx, current.stroke, progress * current.recorded);
      }

      if (settledCount >= timeline.strokes.length) {
        if (!finished) {
          finished = true;
          onDoneRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [timeline]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      role="img"
      aria-label="Replay of the sketch being drawn"
      className="w-full border border-graphite-200 shadow-folder"
      style={{
        aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
        backgroundColor: PAPER_COLOR,
      }}
    />
  );
}