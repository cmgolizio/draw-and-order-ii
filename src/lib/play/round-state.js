export const initialRound = {
  phase: "drawing",
  clue: 0,
  furthest: 0,
  error: null,
  result: null,
};
export function roundReducer(state, event) {
  switch (event.type) {
    case "clue":
      return state.phase === "drawing"
        ? {
            ...state,
            clue: event.index,
            furthest: Math.max(state.furthest, event.index),
          }
        : state;
    case "finish":
      return state.phase === "drawing"
        ? { ...state, phase: "finishing", error: null }
        : state;
    case "edit":
      return state.phase === "finishing"
        ? { ...state, phase: "drawing", error: null }
        : state;
    case "submit":
      return state.phase === "finishing"
        ? { ...state, phase: "judging", error: null }
        : state;
    case "result":
      return ["judging", "finishing"].includes(state.phase)
        ? { ...state, phase: "suspense", result: event.result, error: null }
        : state;
    case "reveal":
      return state.phase === "suspense"
        ? { ...state, phase: "revealed" }
        : state;
    case "error":
      return ["judging", "finishing"].includes(state.phase)
        ? { ...state, phase: "finishing", error: event.message }
        : state;
    default:
      return state;
  }
}
