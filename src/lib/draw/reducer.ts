/**
 * Canvas state (Phase 3): strokes, tool settings, undo/redo stroke stack,
 * guide flag. A plain useReducer — prop-drilling stayed manageable, so no
 * Zustand (per the build-plan note: decide during implementation).
 *
 * The in-progress stroke intentionally lives OUTSIDE this reducer (buffered
 * in the canvas component at pointer-event rate) and is only committed here
 * on pointer-up, so undo/redo history stays one-entry-per-stroke and
 * reducer churn never gates 60fps drawing.
 */
import {
  DEFAULT_ERASER_SIZE,
  type PencilGrade,
  type Stroke,
  type Tool,
} from "./types";

export type CanvasState = {
  strokes: Stroke[];
  redoStack: Stroke[];
  tool: Tool;
  grade: PencilGrade;
  pencilSize: number;
  eraserSize: number;
  guideVisible: boolean;
  /** Sticky: once the guide has been shown, the round is flagged (x0.95). */
  usedGuide: boolean;
  nextStrokeId: number;
};

export const initialCanvasState: CanvasState = {
  strokes: [],
  redoStack: [],
  tool: "pencil",
  grade: "2B",
  pencilSize: 8,
  eraserSize: DEFAULT_ERASER_SIZE,
  guideVisible: false,
  usedGuide: false,
  nextStrokeId: 1,
};

export type CanvasAction =
  | { type: "commitStroke"; stroke: Stroke }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" }
  | { type: "setTool"; tool: Tool }
  | { type: "setGrade"; grade: PencilGrade }
  | { type: "setPencilSize"; size: number }
  | { type: "setEraserSize"; size: number }
  | { type: "toggleGuide" };

export function canvasReducer(
  state: CanvasState,
  action: CanvasAction,
): CanvasState {
  switch (action.type) {
    case "commitStroke":
      if (action.stroke.points.length === 0) return state;
      return {
        ...state,
        strokes: [...state.strokes, action.stroke],
        redoStack: [], // a new stroke invalidates the redo branch
        nextStrokeId: state.nextStrokeId + 1,
      };
    case "undo": {
      if (state.strokes.length === 0) return state;
      const strokes = state.strokes.slice(0, -1);
      return {
        ...state,
        strokes,
        redoStack: [...state.redoStack, state.strokes[state.strokes.length - 1]],
      };
    }
    case "redo": {
      if (state.redoStack.length === 0) return state;
      const redoStack = state.redoStack.slice(0, -1);
      return {
        ...state,
        strokes: [...state.strokes, state.redoStack[state.redoStack.length - 1]],
        redoStack,
      };
    }
    case "clear":
      // Reached only through the confirm step in the toolbar.
      return { ...state, strokes: [], redoStack: [] };
    case "setTool":
      return { ...state, tool: action.tool };
    case "setGrade":
      return { ...state, grade: action.grade, tool: "pencil" };
    case "setPencilSize":
      return { ...state, pencilSize: action.size };
    case "setEraserSize":
      return { ...state, eraserSize: action.size };
    case "toggleGuide": {
      const guideVisible = !state.guideVisible;
      return {
        ...state,
        guideVisible,
        usedGuide: state.usedGuide || guideVisible,
      };
    }
  }
}