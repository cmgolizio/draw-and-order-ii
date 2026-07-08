"use client";

/**
 * Grayscale toolkit (Phase 3): 5-step pencil-grade value swatch, size
 * presets + slider, its-own-size eraser, undo/redo, clear-with-confirm,
 * guide toggle. Fully keyboard operable.
 */
import { useEffect, useRef, useState } from "react";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { cx } from "@/lib/cx";
import type { CanvasAction, CanvasState } from "@/lib/draw/reducer";
import {
  ERASER_SIZE_RANGE,
  GRADE_VALUE,
  PENCIL_GRADES,
  PENCIL_SIZE_PRESETS,
  PENCIL_SIZE_RANGE,
} from "@/lib/draw/types";

type Props = {
  state: CanvasState;
  dispatch: React.Dispatch<CanvasAction>;
  hasGuide: boolean;
  /** vertical rail on desktop, compact grid inside the mobile sheet */
  layout: "rail" | "sheet";
};

/** Conflicting bg/text utilities must not coexist — pick one full set per state. */
function toolButtonCls(active = false, extra?: string) {
  return cx(
    "type-label cursor-pointer border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
    active
      ? "border-ink bg-ink text-paper"
      : "border-graphite-300 bg-paper text-ink-soft hover:bg-manila-50",
    extra,
  );
}

export function Toolbar({ state, dispatch, hasGuide, layout }: Props) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  function handleClear() {
    if (!confirmingClear) {
      setConfirmingClear(true);
      clearTimer.current = setTimeout(() => setConfirmingClear(false), 3000);
      return;
    }
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setConfirmingClear(false);
    dispatch({ type: "clear" });
  }

  const isEraser = state.tool === "eraser";
  const sizeRange = isEraser ? ERASER_SIZE_RANGE : PENCIL_SIZE_RANGE;
  const size = isEraser ? state.eraserSize : state.pencilSize;

  return (
    <div
      className={cx(
        "flex gap-4",
        layout === "rail" ? "flex-col" : "flex-row flex-wrap items-start",
      )}
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={layout === "rail" ? "vertical" : "horizontal"}
    >
      {/* Pencil grades — the value swatch */}
      <section aria-label="Pencil grade">
        <p className="type-label mb-1.5 text-[10px] text-ink-faint">Pencil</p>
        <div className="flex gap-1">
          {PENCIL_GRADES.map((grade) => {
            const active = !isEraser && state.grade === grade;
            return (
              <button
                key={grade}
                type="button"
                aria-pressed={active}
                aria-label={`${grade} pencil, ${Math.round(GRADE_VALUE[grade] * 100)}% black`}
                title={`${grade} · ${Math.round(GRADE_VALUE[grade] * 100)}% black`}
                onClick={() => dispatch({ type: "setGrade", grade })}
                className={cx(
                  "flex size-9 cursor-pointer flex-col items-center justify-center border transition-colors",
                  active
                    ? "border-ink shadow-pressed"
                    : "border-graphite-300 hover:border-ink-faint",
                )}
                style={{ backgroundColor: "#fbf9f4" }}
              >
                <span
                  aria-hidden
                  className="mb-0.5 block h-2.5 w-5 rounded-xs"
                  style={{
                    backgroundColor: `rgba(26, 24, 20, ${GRADE_VALUE[grade]})`,
                  }}
                />
                <span className="font-typewriter text-[9px] leading-none text-ink-soft">
                  {grade}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Eraser */}
      <section aria-label="Eraser">
        <p className="type-label mb-1.5 text-[10px] text-ink-faint">Eraser</p>
        <button
          type="button"
          aria-pressed={isEraser}
          onClick={() =>
            dispatch({ type: "setTool", tool: isEraser ? "pencil" : "eraser" })
          }
          className={toolButtonCls(isEraser)}
        >
          Eraser
        </button>
      </section>

      {/* Size presets + slider (per-tool) */}
      <section aria-label="Brush size" className="min-w-36">
        <p className="type-label mb-1.5 text-[10px] text-ink-faint">
          {isEraser ? "Eraser size" : "Brush size"}
        </p>
        {!isEraser && (
          <div className="mb-1.5 flex gap-1">
            {PENCIL_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={state.pencilSize === preset.size}
                onClick={() =>
                  dispatch({ type: "setPencilSize", size: preset.size })
                }
                className={toolButtonCls(state.pencilSize === preset.size)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2">
          <span className="sr-only">
            {isEraser ? "Eraser size" : "Brush size"} slider
          </span>
          <input
            type="range"
            min={sizeRange.min}
            max={sizeRange.max}
            value={size}
            onChange={(e) =>
              dispatch({
                type: isEraser ? "setEraserSize" : "setPencilSize",
                size: Number(e.target.value),
              })
            }
            className="w-full accent-ink"
          />
          <span className="font-typewriter w-7 text-right text-[10px] text-ink-faint">
            {size}
          </span>
        </label>
      </section>

      {/* History */}
      <section aria-label="History">
        <p className="type-label mb-1.5 text-[10px] text-ink-faint">History</p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => dispatch({ type: "undo" })}
            disabled={state.strokes.length === 0}
            className={toolButtonCls()}
            title="Undo (Ctrl/Cmd+Z, two-finger tap)"
            aria-keyshortcuts="Control+Z Meta+Z"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "redo" })}
            disabled={state.redoStack.length === 0}
            className={toolButtonCls()}
            title="Redo (Shift+Ctrl/Cmd+Z)"
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={state.strokes.length === 0 && !confirmingClear}
            aria-live="polite"
            className={
              confirmingClear
                ? "type-label cursor-pointer border border-stamp-red-deep bg-paper px-2.5 py-1.5 text-xs text-stamp-red-deep transition-colors hover:bg-stamp-red/10"
                : toolButtonCls()
            }
          >
            {confirmingClear ? "Sure?" : "Clear"}
          </button>
        </div>
      </section>

      {/* Silhouette guide */}
      {hasGuide && (
        <section aria-label="Guide">
          <p className="type-label mb-1.5 text-[10px] text-ink-faint">Guide</p>
          <button
            type="button"
            aria-pressed={state.guideVisible}
            onClick={() => dispatch({ type: "toggleGuide" })}
            className={toolButtonCls(state.guideVisible)}
            title="Silhouette overlay — using it applies a ×0.95 score multiplier"
          >
            {state.guideVisible ? "Guide on" : "Guide off"}
          </button>
          {state.usedGuide && (
            <p className="font-typewriter mt-1 text-[9px] text-ink-faint">
              flagged: ×0.95
            </p>
          )}
        </section>
      )}

      {/* Optional pencil-scratch audio — muted by default */}
      <section aria-label="Sound">
        <p className="type-label mb-1.5 text-[10px] text-ink-faint">Sound</p>
        <SoundToggle />
      </section>
    </div>
  );
}