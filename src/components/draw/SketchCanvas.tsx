"use client";

/**
 * The sketch surface (Phase 3). Raw pointer events (with coalescing + pointer
 * capture) feed a point buffer; perfect-freehand turns it into tapered,
 * pressure-sensitive outlines rendered as filled Konva paths.
 *
 * - Fixed logical size 800x1040, scaled responsively via Stage scale; export
 *   is always the same resolution regardless of device.
 * - Real pressure when pointerType === 'pen'; simulated from velocity
 *   otherwise. Palm rejection: touches are ignored while a pen is active.
 * - Two-finger tap fires the undo gesture.
 * - The in-progress stroke lives in refs and repaints on rAF so pointermove
 *   frequency never outruns the frame budget.
 */
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type Konva from "konva";
import { Layer, Path, Rect, Stage } from "react-konva";
import { strokeToPathData } from "@/lib/draw/strokes";
import { startPencilScratch, type ScratchHandle } from "@/lib/sound";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GRADE_VALUE,
  INK_COLOR,
  PAPER_COLOR,
  type PencilGrade,
  type Stroke,
  type StrokePoint,
  type Tool,
} from "@/lib/draw/types";

export type SketchCanvasHandle = {
  /** PNG data-URL at exactly 800x1040, any device, any zoom. */
  exportPng(): string | null;
};

type Props = {
  strokes: Stroke[];
  tool: Tool;
  grade: PencilGrade;
  pencilSize: number;
  eraserSize: number;
  nextStrokeId: number;
  guideVisible: boolean;
  guideUrl: string | null;
  onCommitStroke(stroke: Stroke): void;
  onUndoGesture(): void;
};

const TWO_FINGER_TAP_MS = 350;
const TWO_FINGER_TAP_SLOP_PX = 14;

const CommittedStroke = memo(function CommittedStroke({
  stroke,
}: {
  stroke: Stroke;
}) {
  const data = useMemo(() => strokeToPathData(stroke), [stroke]);
  if (!data) return null;
  return (
    <Path
      data={data}
      fill={INK_COLOR}
      opacity={stroke.tool === "eraser" ? 1 : GRADE_VALUE[stroke.grade]}
      globalCompositeOperation={
        stroke.tool === "eraser" ? "destination-out" : "source-over"
      }
      listening={false}
      perfectDrawEnabled={false}
    />
  );
});

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(
  function SketchCanvas(props, ref) {
    const {
      strokes,
      tool,
      grade,
      pencilSize,
      eraserSize,
      nextStrokeId,
      guideVisible,
      guideUrl,
      onCommitStroke,
      onUndoGesture,
    } = props;

    const wrapperRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<Konva.Stage>(null);
    const [scale, setScale] = useState(0);

    // --- responsive scale: logical size is fixed, the Stage scales ---------
    useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const observer = new ResizeObserver(() => {
        setScale(el.clientWidth / CANVAS_WIDTH);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // --- in-progress stroke (refs + rAF repaint) ----------------------------
    const sessionStart = useRef(0);
    useEffect(() => {
      sessionStart.current = performance.now();
    }, []);

    const currentStroke = useRef<Stroke | null>(null);
    const strokeStartedAt = useRef(0);
    const drawingPointerId = useRef<number | null>(null);
    const rafId = useRef(0);
    const [, forceRepaint] = useState(0);

    // Optional pencil-scratch audio (Phase 7) — null whenever sound is off.
    const scratch = useRef<ScratchHandle | null>(null);
    useEffect(
      () => () => {
        scratch.current?.stop();
        scratch.current = null;
      },
      [],
    );

    const scheduleRepaint = useCallback(() => {
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        forceRepaint((n) => n + 1);
      });
    }, []);
    useEffect(() => () => cancelAnimationFrame(rafId.current), []);

    // --- palm rejection + two-finger tap bookkeeping ------------------------
    const activePens = useRef(new Set<number>());
    const activeTouches = useRef(new Map<number, { x: number; y: number }>());
    const twoFingerTap = useRef<{ at: number; moved: boolean } | null>(null);

    const toLogical = useCallback(
      (e: React.PointerEvent): StrokePoint => {
        const rect = wrapperRef.current!.getBoundingClientRect();
        const s = rect.width / CANVAS_WIDTH;
        const pressure =
          e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 0.5;
        return [
          (e.clientX - rect.left) / s,
          (e.clientY - rect.top) / s,
          pressure,
          performance.now() - strokeStartedAt.current,
        ];
      },
      [],
    );

    const cancelCurrentStroke = useCallback(() => {
      currentStroke.current = null;
      drawingPointerId.current = null;
      scratch.current?.stop();
      scratch.current = null;
      scheduleRepaint();
    }, [scheduleRepaint]);

    const handlePointerDown = useCallback(
      (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;

        if (e.pointerType === "pen") activePens.current.add(e.pointerId);

        if (e.pointerType === "touch") {
          // Palm rejection: a resting hand must not draw while the pen works.
          if (activePens.current.size > 0) return;

          activeTouches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (activeTouches.current.size === 2) {
            // Second finger down: this is a gesture, not a stroke.
            if (
              drawingPointerId.current !== null &&
              activeTouches.current.has(drawingPointerId.current)
            ) {
              cancelCurrentStroke();
            }
            twoFingerTap.current = { at: performance.now(), moved: false };
            return;
          }
          if (activeTouches.current.size > 2) return;
        }

        if (drawingPointerId.current !== null) return; // one stroke at a time

        drawingPointerId.current = e.pointerId;
        try {
          wrapperRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already gone (pen lifted between down and capture) —
          // the stroke still starts; we just lose outside-the-bounds capture.
        }
        strokeStartedAt.current = performance.now();
        currentStroke.current = {
          id: nextStrokeId,
          tool,
          grade,
          size: tool === "eraser" ? eraserSize : pencilSize,
          simulatePressure: e.pointerType !== "pen",
          startedAt: strokeStartedAt.current - sessionStart.current,
          points: [toLogical(e)],
        };
        if (tool === "pencil") scratch.current = startPencilScratch();
        scheduleRepaint();
      },
      [
        tool,
        grade,
        pencilSize,
        eraserSize,
        nextStrokeId,
        toLogical,
        cancelCurrentStroke,
        scheduleRepaint,
      ],
    );

    const handlePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (e.pointerType === "touch") {
          const start = activeTouches.current.get(e.pointerId);
          if (
            start &&
            twoFingerTap.current &&
            Math.hypot(e.clientX - start.x, e.clientY - start.y) >
              TWO_FINGER_TAP_SLOP_PX
          ) {
            twoFingerTap.current.moved = true;
          }
        }
        if (e.pointerId !== drawingPointerId.current || !currentStroke.current)
          return;

        // Coalesced events preserve full pen fidelity at 120Hz+.
        const native = e.nativeEvent as PointerEvent;
        const events =
          typeof native.getCoalescedEvents === "function" &&
          native.getCoalescedEvents().length > 0
            ? native.getCoalescedEvents()
            : [native];
        const rect = wrapperRef.current!.getBoundingClientRect();
        const s = rect.width / CANVAS_WIDTH;
        for (const ev of events) {
          const pressure =
            e.pointerType === "pen" && ev.pressure > 0 ? ev.pressure : 0.5;
          currentStroke.current.points.push([
            (ev.clientX - rect.left) / s,
            (ev.clientY - rect.top) / s,
            pressure,
            performance.now() - strokeStartedAt.current,
          ]);
        }
        if (scratch.current) {
          // Speed over the last two points (logical px/ms) drives loudness.
          const pts = currentStroke.current.points;
          if (pts.length >= 2) {
            const [x1, y1, , t1] = pts[pts.length - 1];
            const [x0, y0, , t0] = pts[pts.length - 2];
            const dt = Math.max(1, t1 - t0);
            scratch.current.move(Math.hypot(x1 - x0, y1 - y0) / dt);
          }
        }
        scheduleRepaint();
      },
      [scheduleRepaint],
    );

    const endPointer = useCallback(
      (e: React.PointerEvent, cancelled: boolean) => {
        if (e.pointerType === "pen") activePens.current.delete(e.pointerId);

        if (e.pointerType === "touch") {
          activeTouches.current.delete(e.pointerId);
          if (
            twoFingerTap.current &&
            activeTouches.current.size === 0
          ) {
            const { at, moved } = twoFingerTap.current;
            twoFingerTap.current = null;
            if (!moved && performance.now() - at < TWO_FINGER_TAP_MS) {
              onUndoGesture();
            }
          }
        }

        if (e.pointerId !== drawingPointerId.current) return;
        const stroke = currentStroke.current;
        currentStroke.current = null;
        drawingPointerId.current = null;
        scratch.current?.stop();
        scratch.current = null;
        if (!cancelled && stroke && stroke.points.length > 0) {
          onCommitStroke(stroke);
        }
        scheduleRepaint();
      },
      [onCommitStroke, onUndoGesture, scheduleRepaint],
    );

    // --- export: identical resolution on every device -----------------------
    useImperativeHandle(ref, () => ({
      exportPng() {
        const stage = stageRef.current;
        if (!stage) return null;
        const prev = { scale: stage.scaleX(), w: stage.width(), h: stage.height() };
        stage.scale({ x: 1, y: 1 });
        stage.size({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
        const dataUrl = stage.toDataURL({ pixelRatio: 1, mimeType: "image/png" });
        stage.scale({ x: prev.scale, y: prev.scale });
        stage.size({ width: prev.w, height: prev.h });
        stage.batchDraw();
        return dataUrl;
      },
    }));

    const current = currentStroke.current;
    const currentData = current ? strokeToPathData(current) : "";

    return (
      <div
        ref={wrapperRef}
        role="img"
        aria-label="Sketch canvas — draw the suspect here"
        className="relative w-full cursor-crosshair select-none shadow-folder"
        style={{
          aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`,
          touchAction: "none",
          backgroundColor: PAPER_COLOR,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {scale > 0 && (
          <Stage
            ref={stageRef}
            width={CANVAS_WIDTH * scale}
            height={CANVAS_HEIGHT * scale}
            scaleX={scale}
            scaleY={scale}
            listening={false}
          >
            <Layer listening={false}>
              <Rect
                x={0}
                y={0}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                fill={PAPER_COLOR}
              />
            </Layer>
            <Layer listening={false}>
              {strokes.map((stroke) => (
                <CommittedStroke key={stroke.id} stroke={stroke} />
              ))}
              {current && currentData && (
                <Path
                  data={currentData}
                  fill={INK_COLOR}
                  opacity={
                    current.tool === "eraser" ? 1 : GRADE_VALUE[current.grade]
                  }
                  globalCompositeOperation={
                    current.tool === "eraser" ? "destination-out" : "source-over"
                  }
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )}
            </Layer>
          </Stage>
        )}
        {guideVisible && guideUrl && (
          // DOM overlay, never part of the Konva export — assist, not free lunch.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={guideUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25"
          />
        )}
      </div>
    );
  },
);

export default SketchCanvas;