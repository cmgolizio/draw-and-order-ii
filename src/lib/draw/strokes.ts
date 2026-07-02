/**
 * Stroke engine (Phase 3): point buffer -> perfect-freehand outline -> SVG
 * path data rendered as a filled Konva.Path. Tapered, pressure-sensitive,
 * hand-drawn-feeling lines.
 */
import { getStroke } from "perfect-freehand";
import type { Stroke } from "./types";

/**
 * Tuned perfect-freehand options. `size` comes from the brush setting;
 * pressure is real when `pointerType === 'pen'` and simulated from velocity
 * otherwise (perfect-freehand's `simulatePressure`).
 */
export function strokeOptions(stroke: Pick<Stroke, "size" | "simulatePressure">) {
  return {
    size: stroke.size,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: stroke.simulatePressure,
    easing: (t: number) => t,
    start: { taper: 2, cap: true },
    end: { taper: 2, cap: true },
  };
}

/** Outline polygon -> smooth quadratic-bezier SVG path data. */
export function outlineToPathData(outline: number[][]): string {
  if (outline.length < 2) return "";
  let d = `M ${outline[0][0].toFixed(2)} ${outline[0][1].toFixed(2)} Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += ` ${x0.toFixed(2)} ${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)} ${((y0 + y1) / 2).toFixed(2)}`;
  }
  return d + " Z";
}

/** Full stroke -> path data (empty string until there are enough points). */
export function strokeToPathData(stroke: Stroke): string {
  if (stroke.points.length === 0) return "";
  return outlineToPathData(getStroke(stroke.points, strokeOptions(stroke)));
}