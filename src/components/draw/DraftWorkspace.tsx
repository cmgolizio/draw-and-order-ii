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

export type SubmitArgs = {
  /** PNG data-URL at exactly 800x1040. */
  dataUrl: string;
  /** Serialized stroke log, or null when it blew the 200KB cap. */
  strokeLog: string | null;
  /** Sticky guide flag — applies the x0.95 multiplier server-side too. */
  usedGuide: boolean;
};

type Props = {
  briefing: DrawBriefing;
  busy: "opening" | "submitting" | "forfeiting" | null;
  submitError: string | null;
  onSubmit(args: SubmitArgs): void;
  onForfeit(): void;
};

export function DrawWorkspace({
  briefing,
  busy,
  submitError,
  onSubmit,
  onForfeit,
}: Props) {
  const [state, dispatch] = useReducer(canvasReducer, initialCanvasState);
  const canvasRef = useRef<SketchCanvasHandle>(null);
  const [openSheet, setOpenSheet] = useState<Sheet>(null);
  const [fabsExpanded, setFabsExpanded] = useState(false);

  // Submit and forfeit both end the round — a second tap confirms.
  const [confirming, setConfirming] = useState<"submit" | "forfeit" | null>(
    null,
  );
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    [],
  );

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

  /** Demo-case fallback: no round to submit to, so download the PNG locally. */
  const handleSave = useCallback(() => {
    const dataUrl = canvasRef.current?.exportPng();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "sketch-800x1040.png";
    a.click();
  }, []);

  /** First tap arms the confirm state; the second within 4s acts. */
  const handleEndRound = useCallback(
    (kind: "submit" | "forfeit") => {
      if (confirming !== kind) {
        setConfirming(kind);
        if (confirmTimer.current) clearTimeout(confirmTimer.current);
        confirmTimer.current = setTimeout(() => setConfirming(null), 4000);
        return;
      }
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      setConfirming(null);

      if (kind === "submit") {
        const dataUrl = canvasRef.current?.exportPng();
        if (!dataUrl) return;
        const strokeLog = serializeStrokeLog(state.strokes);
        if (strokeLog === null && state.strokes.length > 0) {
          console.info("stroke log exceeded 200KB cap — dropped (drawing kept)");
        }
        onSubmit({ dataUrl, strokeLog, usedGuide: state.usedGuide });
      } else {
        onForfeit();
      }
    },
    [confirming, onSubmit, onForfeit, state.strokes, state.usedGuide],
  );

  const isDemo = briefing.source === "demo";

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
          {isDemo ? (
            <InkButton variant="blue" onClick={handleSave}>
              Save sketch
            </InkButton>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <InkButton
                variant="ink"
                onClick={() => handleEndRound("forfeit")}
                disabled={busy !== null}
                aria-live="polite"
              >
                {busy === "forfeiting"
                  ? "Closing case…"
                  : confirming === "forfeit"
                    ? "Give up?"
                    : "Turn yourself in"}
              </InkButton>
              <InkButton
                variant="red"
                onClick={() => handleEndRound("submit")}
                disabled={busy !== null}
                aria-live="polite"
              >
                {busy === "submitting"
                  ? "Filing sketch…"
                  : confirming === "submit"
                    ? "File it?"
                    : "Submit sketch"}
              </InkButton>
            </div>
          )}
        </div>
        {submitError && (
          <p
            role="alert"
            className="mt-2 border border-stamp-red-deep/40 bg-paper p-3 text-sm text-stamp-red-deep"
          >
            {submitError}
          </p>
        )}
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