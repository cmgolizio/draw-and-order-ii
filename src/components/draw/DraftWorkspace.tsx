"use client";

/**
 * The drawing experience (Phase 3): canvas + grayscale toolkit + case file,
 * with the v1 FAB pattern on mobile (Tools / Case File / Guide as expandable
 * floating buttons, panels as bottom sheets so the canvas stays visible).
 *
 * Konva is client-only, so the canvas is dynamically imported with
 * ssr: false from inside this Client Component (Next 16: `ssr: false`
 * is not allowed in Server Components).
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import {
  canvasReducer,
  initialCanvasState,
} from "@/lib/draw/reducer";
import { DEMO_SILHOUETTE_URL, type DrawBriefing } from "@/lib/draw/demoCase";
import { serializeStrokeLog } from "@/lib/draw/strokeLog";
import type { SketchCanvasHandle } from "@/components/draw/SketchCanvas";
import { CaseFilePanel } from "@/components/draw/CaseFilePanel";
import { Toolbar } from "@/components/draw/ToolBar";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { CaseFolder } from "@/components/ui/CaseFolder";

const SketchCanvas = dynamic(() => import("@/components/draw/SketchCanvas"), {
  ssr: false,
  loading: () => (
    <div
      className="w-full animate-pulse bg-paper shadow-folder"
      style={{ aspectRatio: "800 / 1040" }}
      aria-label="Loading sketch canvas"
    />
  ),
});

type Sheet = "tools" | "case" | null;

export function DrawWorkspace({ briefing }: { briefing: DrawBriefing }) {
  const [state, dispatch] = useReducer(canvasReducer, initialCanvasState);
  const canvasRef = useRef<SketchCanvasHandle>(null);
  const [openSheet, setOpenSheet] = useState<Sheet>(null);
  const [fabsExpanded, setFabsExpanded] = useState(false);

  const guideUrl = briefing.silhouetteUrl ?? DEMO_SILHOUETTE_URL;

  // Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleUndoGesture = useCallback(() => dispatch({ type: "undo" }), []);

  /**
   * Placeholder for Phase 4's submit: proves the export pipeline (PNG always
   * 800x1040 + capped stroke log) by downloading the sketch locally.
   */
  const handleSave = useCallback(() => {
    const dataUrl = canvasRef.current?.exportPng();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "sketch-800x1040.png";
    a.click();

    const log = serializeStrokeLog(state.strokes);
    if (log === null && state.strokes.length > 0) {
      console.info("stroke log exceeded 200KB cap — dropped (drawing kept)");
    }
  }, [state.strokes]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Desktop tool rail */}
      <aside className="hidden w-48 shrink-0 lg:block">
        <CaseFolder tab="Tools" bodyClassName="p-4">
          <Toolbar state={state} dispatch={dispatch} hasGuide layout="rail" />
        </CaseFolder>
      </aside>

      {/* Canvas column */}
      <div className="mx-auto w-full max-w-xl flex-1 lg:mx-0">
        <SketchCanvas
          ref={canvasRef}
          strokes={state.strokes}
          tool={state.tool}
          grade={state.grade}
          pencilSize={state.pencilSize}
          eraserSize={state.eraserSize}
          nextStrokeId={state.nextStrokeId}
          guideVisible={state.guideVisible}
          guideUrl={guideUrl}
          onCommitStroke={(stroke) => dispatch({ type: "commitStroke", stroke })}
          onUndoGesture={handleUndoGesture}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <EvidenceTag>Exhibit A · your sketch</EvidenceTag>
          <InkButton variant="blue" onClick={handleSave}>
            Save sketch
          </InkButton>
        </div>
      </div>

      {/* Desktop case file */}
      <aside className="hidden w-80 shrink-0 lg:block">
        <CaseFolder tab="Case file" paperClip bodyClassName="p-5">
          <CaseFilePanel briefing={briefing} />
        </CaseFolder>
      </aside>

      {/* Mobile FABs — expand on first tap, act on the second */}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2 lg:hidden">
        {fabsExpanded && (
          <>
            <FabButton
              label="Tools"
              onClick={() => setOpenSheet(openSheet === "tools" ? null : "tools")}
              active={openSheet === "tools"}
            />
            <FabButton
              label="Case file"
              onClick={() => setOpenSheet(openSheet === "case" ? null : "case")}
              active={openSheet === "case"}
            />
            <FabButton
              label={state.guideVisible ? "Guide on" : "Guide"}
              onClick={() => dispatch({ type: "toggleGuide" })}
              active={state.guideVisible}
            />
          </>
        )}
        <button
          type="button"
          aria-expanded={fabsExpanded}
          aria-label={fabsExpanded ? "Collapse actions" : "Expand actions"}
          onClick={() => {
            setFabsExpanded((v) => !v);
            if (fabsExpanded) setOpenSheet(null);
          }}
          className="type-label flex size-12 cursor-pointer items-center justify-center rounded-full border-2 border-ink-soft bg-manila-100 text-lg text-ink shadow-folder-lg active:shadow-pressed"
        >
          {fabsExpanded ? "×" : "☰"}
        </button>
      </div>

      {/* Bottom sheets — canvas stays partially visible */}
      {openSheet && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={openSheet === "tools" ? "Drawing tools" : "Case file"}
          className="texture-grain fixed inset-x-0 bottom-0 z-40 max-h-[55vh] overflow-y-auto rounded-t-xl border-t border-kraft-500 bg-manila-100 p-4 pr-28 pb-20 shadow-folder-lg lg:hidden"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="type-label text-xs text-ink-faint">
              {openSheet === "tools" ? "Tools" : "Case file"}
            </span>
            <button
              type="button"
              onClick={() => setOpenSheet(null)}
              className="type-label cursor-pointer px-2 py-1 text-xs text-ink-soft"
            >
              Close
            </button>
          </div>
          {openSheet === "tools" ? (
            <Toolbar state={state} dispatch={dispatch} hasGuide layout="sheet" />
          ) : (
            <CaseFilePanel briefing={briefing} />
          )}
        </div>
      )}
    </div>
  );
}

function FabButton({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "type-label cursor-pointer rounded-full border-2 px-4 py-2 text-xs shadow-folder active:shadow-pressed",
        active
          ? "border-ink bg-ink text-paper"
          : "border-ink-soft bg-manila-100 text-ink",
      )}
    >
      {label}
    </button>
  );
}