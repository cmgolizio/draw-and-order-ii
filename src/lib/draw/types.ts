/**
 * Canvas domain types (Phase 3). The canvas has a FIXED logical size — the
 * exported drawing is always 800x1040 regardless of device, so every sketch
 * is scored against identical framing (v1 exported at viewport size).
 */

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 1040;

/** [x, y, pressure, msSinceStrokeStart] in logical canvas coordinates. */
export type StrokePoint = [number, number, number, number];

export type Tool = "pencil" | "eraser";

/** Pencil grades = the 5-step value swatch (10%..90% black). */
export const PENCIL_GRADES = ["2H", "HB", "2B", "4B", "6B"] as const;
export type PencilGrade = (typeof PENCIL_GRADES)[number];

export const GRADE_VALUE: Record<PencilGrade, number> = {
  "2H": 0.1,
  HB: 0.3,
  "2B": 0.5,
  "4B": 0.7,
  "6B": 0.9,
};

export const INK_COLOR = "#1a1814";
export const PAPER_COLOR = "#fbf9f4";

export const PENCIL_SIZE_PRESETS = [
  { label: "Fine", size: 4 },
  { label: "Medium", size: 8 },
  { label: "Broad", size: 16 },
] as const;
export const PENCIL_SIZE_RANGE = { min: 2, max: 32 } as const;
export const ERASER_SIZE_RANGE = { min: 8, max: 64 } as const;
export const DEFAULT_ERASER_SIZE = 24;

export type Stroke = {
  id: number;
  tool: Tool;
  grade: PencilGrade;
  size: number;
  /** True when pressure is simulated from velocity (mouse/finger), false for a real pen. */
  simulatePressure: boolean;
  /** ms since the drawing session started; kept for the replay log. */
  startedAt: number;
  points: StrokePoint[];
};