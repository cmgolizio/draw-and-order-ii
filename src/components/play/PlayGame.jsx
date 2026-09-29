"use client";
import dynamic from "next/dynamic";
import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { canvasReducer, initialCanvasState } from "@/lib/draw/reducer";
import { serializeStrokeLog, parseStrokeLog } from "@/lib/draw/strokeLog";
import { getOrCreateAnonId } from "@/lib/game/anon-id";
import { initialRound, roundReducer } from "@/lib/play/round-state";
import { TurnstileWidget } from "@/components/draw/TurnstileWidget";
import { StrokeReplay } from "@/components/results/StrokeReplay";
import { DailyLeaderboard } from "@/components/daily/DailyLeaderboard";
import { SoundToggle } from "@/components/ui/SoundToggle";
const Canvas = dynamic(() => import("@/components/draw/SketchCanvas"), {
  ssr: false,
  loading: () => <div className="canvas-loading">Getting your paper…</div>,
});
const COLORS = [
  ["Ink", "#202c43"],
  ["Red", "#df493b"],
  ["Orange", "#f07830"],
  ["Yellow", "#eabf36"],
  ["Green", "#319979"],
  ["Blue", "#345ad5"],
  ["Violet", "#8962ac"],
  ["Brown", "#946147"],
];
const WITNESS_IMAGE = {
  pip: "/witnesses/pip.webp",
  otis: "/witnesses/otis.webp",
  bea: "/witnesses/bea.webp",
};
async function api(url, options) {
  const res = await fetch(url, {
    ...options,
    signal: options?.signal ?? AbortSignal.timeout(60000),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      "The desk is offline. Your sketch is still here. Try again.",
    );
  }
  if (!res.ok) {
    const e = new Error(data.error || "That didn’t go through. Try again.");
    e.code = data.code;
    e.roundId = data.roundId;
    throw e;
  }
  return data;
}
function archiveWitnesses(statement) {
  const sentences = statement.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [statement];
  const size = Math.ceil(sentences.length / 3);
  return Array.from({ length: 3 }, (_, i) => ({
    id: "archive",
    name: "The original witness",
    role: `Statement · part ${i + 1}`,
    text: sentences
      .slice(i * size, (i + 1) * size)
      .join(" ")
      .trim(),
  })).filter((w) => w.text);
}

export default function PlayGame({ initialCase, mode = "practice" }) {
  const [brief, setBrief] = useState(initialCase),
    [serial, setSerial] = useState(0),
    [opening, setOpening] = useState(false),
    [entryError, setEntryError] = useState(null),
    [history, setHistory] = useState(null);
  const index = useRef(0),
    lock = useRef(false);
  async function nextCase(live = false) {
    if (lock.current) return;
    lock.current = true;
    document.querySelector(".play-menu")?.removeAttribute("open");
    setOpening(true);
    setEntryError(null);
    setHistory(null);
    try {
      let next;
      if (live) {
        const data = await api("/api/rounds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            difficulty: mode === "practice" ? "detective" : undefined,
            anonId: getOrCreateAnonId(),
          }),
          signal: AbortSignal.timeout(12000),
        });
        next = {
          ...data,
          source: "live",
          id: data.roundId,
          title:
            data.caseContent?.title ||
            data.statementTeaser ||
            "A face in the crowd",
          drawingMode: data.caseContent?.drawingMode || "monochrome",
          witnesses:
            data.caseContent?.witnesses || archiveWitnesses(data.statement),
        };
      } else {
        index.current += 1;
        next = await api(`/api/play/case?index=${index.current}&mode=${mode}`);
      }
      setBrief(next);
      setSerial((n) => n + 1);
    } catch (e) {
      setEntryError(e.message);
      if (e.roundId) setHistory(e.roundId);
    } finally {
      setOpening(false);
      lock.current = false;
    }
  }
  return (
    <div className="play-root">
      <div className="play-topline">
        <p>
          <span className="tiny-star" aria-hidden="true">
            ✳
          </span>{" "}
          {mode === "daily"
            ? "TODAY’S ODD LITTLE CRIME"
            : "ODD LITTLE CRIMES. QUESTIONABLE WITNESSES."}
        </p>
        <div>
          <Link href={mode === "daily" ? "/" : "/daily"}>
            {mode === "daily" ? "Practice" : "Daily case"}
          </Link>
          <details className="play-menu">
            <summary>
              More <span aria-hidden="true">+</span>
            </summary>
            <div>
              <Link href="/me">My sketches</Link>
              <Link href="/login">Sign in</Link>
              <SoundToggle />
              <button disabled={opening} onClick={() => nextCase(true)}>
                {opening
                  ? "Opening…"
                  : mode === "daily"
                    ? "Open ranked daily"
                    : "Open a scored case"}
              </button>
              <p>
                Scored cases use the online judge. Your current practice sketch
                will be replaced when a case opens.
              </p>
            </div>
          </details>
        </div>
      </div>
      {entryError && (
        <div className="entry-error" role="alert">
          {entryError} <strong>Your current case is still playable.</strong>
          {history && (
            <Link href={`/results/${history}`}>View your daily result</Link>
          )}
        </div>
      )}
      <Round
        key={serial}
        brief={brief}
        mode={mode}
        nextCase={() => nextCase(false)}
        opening={opening}
      />
      {mode === "daily" && (
        <details className="rankings">
          <summary>Ranked daily board</summary>
          <p>
            Only online judged rounds count here. Today’s unscored warm-up is
            shared by everyone and may be replayed.
          </p>
          <DailyLeaderboard />
        </details>
      )}
    </div>
  );
}

function Round({ brief, mode, nextCase, opening }) {
  const [round, send] = useReducer(roundReducer, initialRound),
    [drawing, dispatch] = useReducer(canvasReducer, {
      ...initialCanvasState,
      grade: "6B",
      pencilSize: 10,
    });
  const [color, setColor] = useState(COLORS[0][1]),
    [graphite, setGraphite] = useState(brief.drawingMode === "monochrome"),
    [clear, setClear] = useState(false),
    [sketch, setSketch] = useState(null),
    [replay, setReplay] = useState(false),
    [shared, setShared] = useState(""),
    [token, setToken] = useState(null);
  const canvasRef = useRef(null),
    submitLock = useRef(false),
    finishRef = useRef(null),
    resultRef = useRef(null);
  const witness = brief.witnesses[round.clue],
    live = brief.source === "live",
    isDrawing = round.phase === "drawing";
  useEffect(() => {
    const onKey = (e) => {
      if (!isDrawing || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
      if (e.key === "Escape") setClear(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawing]);
  useEffect(() => {
    if (round.phase === "finishing") finishRef.current?.focus();
    if (round.phase === "revealed") resultRef.current?.focus();
    if (round.phase !== "suspense") return;
    const timer = setTimeout(
      () => send({ type: "reveal" }),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1150,
    );
    return () => clearTimeout(timer);
  }, [round.phase]);
  useEffect(() => {
    if (!clear) return;
    const t = setTimeout(() => setClear(false), 5000);
    return () => clearTimeout(t);
  }, [clear]);
  function finish() {
    const data = canvasRef.current?.exportPng();
    if (!data) return;
    setSketch(data);
    send({ type: "finish" });
  }
  async function submit(scored) {
    if (submitLock.current || round.phase !== "finishing") return;
    submitLock.current = true;
    send({ type: "submit" });
    try {
      let result;
      if (!live) {
        result = await api("/api/play/reveal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: brief.id, finished: true }),
        });
      } else if (scored) {
        const form = new FormData();
        form.set("drawing", await (await fetch(sketch)).blob(), "sketch.png");
        form.set("anonId", getOrCreateAnonId());
        form.set("usedGuide", "false");
        if (token) form.set("turnstileToken", token);
        const log = serializeStrokeLog(drawing.strokes);
        if (log) form.set("strokeLog", log);
        const data = await api(`/api/rounds/${brief.roundId}/submit`, {
          method: "POST",
          body: form,
        });
        result = {
          ...data,
          name: data.caseContent?.name || "The suspect",
          reaction: data.caseContent?.reaction,
          feedback: data.caseMatch?.feedback || data.breakdown?.caseReport,
          features: data.caseMatch?.features || [],
          score: data.score,
        };
      } else {
        const form = new FormData();
        form.set("anonId", getOrCreateAnonId());
        form.set("drawing", await (await fetch(sketch)).blob(), "sketch.png");
        const strokeLog = serializeStrokeLog(drawing.strokes);
        if (strokeLog) form.set("strokeLog", strokeLog);
        const data = await api(`/api/rounds/${brief.roundId}/reveal`, {
          method: "POST",
          body: form,
        });
        result = {
          ...data,
          name: "The suspect",
          score: null,
          feedback:
            "Revealed without a score. Your sketch is shown alongside the reference.",
        };
      }
      send({ type: "result", result });
    } catch (e) {
      send({ type: "error", message: e.message });
      setToken(null);
    } finally {
      submitLock.current = false;
    }
  }
  async function share() {
    const text = `Draw & Order — ${brief.title}. ${round.result.score == null ? "An unscored sketch, one very odd suspect." : `${round.result.score}/100 AI likeness.`} ${window.location.origin}`;
    try {
      await navigator.clipboard.writeText(text);
      setShared("Copied!");
    } catch {
      setShared("Copy this: " + text);
    }
  }
  const download = () => {
    const a = document.createElement("a");
    a.href = sketch;
    a.download = `draw-and-order-${brief.id}.png`;
    a.click();
  };
  const log = parseStrokeLog(
    JSON.parse(serializeStrokeLog(drawing.strokes) || "null"),
  );
  if (round.phase === "suspense")
    return (
      <section className="suspense" aria-live="polite">
        <p>THE WITNESSES HAVE SPOKEN.</p>
        <div className="mystery" aria-hidden="true">
          ?
        </div>
        <h1>Let’s meet your suspect.</h1>
        <button
          className="btn btn-primary"
          onClick={() => send({ type: "reveal" })}
        >
          Reveal now
        </button>
      </section>
    );
  if (round.phase === "revealed") {
    const result = round.result;
    return (
      <section className="reveal" ref={resultRef} tabIndex={-1}>
        <div className="reveal-heading">
          <div>
            <span className="eyebrow">MYSTERY, MEET MASTERPIECE.</span>
            <h1>{result.name}</h1>
            <p>{result.reaction || "A face only a witness could describe."}</p>
          </div>
          <div className="score-badge">
            {Number.isFinite(result.score) ? (
              <>
                <strong>
                  {result.score}
                  <small>/100</small>
                </strong>
                <span>AI likeness · an estimate</span>
              </>
            ) : (
              <>
                <strong>Case closed.</strong>
                <span>Unscored · just for the fun of it</span>
              </>
            )}
          </div>
        </div>
        <div className="comparison">
          <figure>
            <figcaption>
              YOUR INTERPRETATION <span>01</span>
            </figcaption>
            {replay && log ? (
              <StrokeReplay strokeLog={log} onDone={() => setReplay(false)} />
            ) : (
              <img src={sketch} alt="Your finished drawing" />
            )}
          </figure>
          <figure>
            <figcaption>
              THE USUAL-ISH SUSPECT <span>02</span>
            </figcaption>
            {result.suspectImageUrl ? (
              <img
                src={result.suspectImageUrl}
                alt={`Reference portrait of ${result.name}`}
              />
            ) : (
              <p>
                The reference could not load.{" "}
                <Link href={`/results/${brief.roundId}`}>
                  Refresh the saved result
                </Link>
                .
              </p>
            )}
          </figure>
        </div>
        <div className="reveal-bottom">
          <div>
            <p className="result-feedback">{result.feedback}</p>
            <details>
              <summary>
                {result.score == null
                  ? "The details to look for"
                  : "How the judge saw it"}
              </summary>
              <ul>
                {result.features?.map((f) => (
                  <li key={f.id || f.label}>
                    <strong>{f.label}</strong>
                    {Number.isFinite(f.score)
                      ? ` · ${f.score}/100`
                      : ` — ${f.description}`}
                  </li>
                ))}
              </ul>
              {result.score != null && (
                <p>
                  An AI opinion of recognizable features, not artistic ability
                  or an exact measurement.
                </p>
              )}
            </details>
          </div>
          <button
            className="btn btn-primary next-case"
            disabled={opening}
            onClick={nextCase}
          >
            {opening
              ? "Opening…"
              : mode === "daily"
                ? "Sketch today’s case again"
                : "Next odd case"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="secondary-actions">
          <button onClick={download}>Save sketch</button>
          {log && (
            <button disabled={replay} onClick={() => setReplay(true)}>
              Replay drawing
            </button>
          )}
          <button onClick={share}>Share a little brag</button>
          {live && (
            <Link href={`/results/${brief.roundId}`}>Saved case report</Link>
          )}
          {mode === "daily" && <Link href="/">Try a practice case</Link>}
          <span role="status">{shared}</span>
        </div>
      </section>
    );
  }
  return (
    <>
      <div className="case-heading">
        <div>
          <span className="eyebrow">YOU’RE THE SKETCH ARTIST</span>
          <h1>
            {brief.title}
            <span className="title-period">.</span>
          </h1>
        </div>
        <p>
          Listen closely. Draw loosely.
          <br />
          <strong>No art degree required.</strong>
        </p>
      </div>
      <div className="desk">
        <div className="tool-rail" aria-label="Drawing tools">
          <button
            className={`tool draw-tool ${drawing.tool === "pencil" ? "active" : ""}`}
            style={{ "--selected-ink": color }}
            aria-pressed={drawing.tool === "pencil"}
            disabled={!isDrawing}
            onClick={() => dispatch({ type: "setTool", tool: "pencil" })}
          >
            <span aria-hidden="true">✎</span>Draw
          </button>
          <button
            className={`tool erase-tool ${drawing.tool === "eraser" ? "active" : ""}`}
            aria-pressed={drawing.tool === "eraser"}
            disabled={!isDrawing}
            onClick={() => dispatch({ type: "setTool", tool: "eraser" })}
          >
            <span aria-hidden="true">▱</span>Erase
          </button>
          <div className="tool-divider" />
          <button
            className="tool"
            aria-label="Undo stroke"
            disabled={!isDrawing || !drawing.strokes.length}
            onClick={() => dispatch({ type: "undo" })}
          >
            <span aria-hidden="true">↶</span>Undo
          </button>
          <button
            className="tool"
            aria-label="Redo stroke"
            disabled={!isDrawing || !drawing.redoStack.length}
            onClick={() => dispatch({ type: "redo" })}
          >
            <span aria-hidden="true">↷</span>Redo
          </button>
          <button
            className={`tool ${clear ? "clear-armed" : ""}`}
            disabled={!isDrawing || !drawing.strokes.length}
            onClick={() => {
              if (clear) {
                dispatch({ type: "clear" });
                setClear(false);
              } else setClear(true);
            }}
          >
            <span aria-hidden="true">×</span>
            {clear ? "Clear it?" : "Clear"}
          </button>
        </div>
        <div className="paper-column">
          <div className="paper">
            <div className="paper-label">
              <span>DRAW THE SUSPECT</span>
              <span aria-hidden="true">D&O / SKETCH DEPT.</span>
            </div>
            <Canvas
              ref={canvasRef}
              strokes={drawing.strokes}
              tool={drawing.tool}
              grade={graphite ? "2B" : "6B"}
              color={brief.drawingMode === "monochrome" ? COLORS[0][1] : color}
              pencilSize={drawing.pencilSize}
              eraserSize={32}
              nextStrokeId={drawing.nextStrokeId}
              guideVisible={false}
              guideUrl={null}
              disabled={!isDrawing || opening}
              onCommitStroke={(stroke) =>
                dispatch({ type: "commitStroke", stroke })
              }
              onUndoGesture={() => isDrawing && dispatch({ type: "undo" })}
            />
            {drawing.strokes.length === 0 && isDrawing && (
              <div className="paper-hint" aria-hidden="true">
                <span>
                  Every great sketch
                  <br />
                  starts with a questionable line.
                </span>
                <i>Make yours here.</i>
              </div>
            )}
          </div>
          <div className="palette-row">
            <div className="swatches" aria-label="Ink colors">
              {(brief.drawingMode === "monochrome"
                ? COLORS.slice(0, 1)
                : COLORS
              ).map(([label, value]) => (
                <button
                  key={value}
                  className={`swatch ${color === value ? "selected" : ""}`}
                  style={{ background: value }}
                  aria-label={`${label} ink`}
                  aria-pressed={color === value}
                  disabled={!isDrawing}
                  onClick={() => {
                    setColor(value);
                    dispatch({ type: "setTool", tool: "pencil" });
                  }}
                />
              ))}
            </div>
            <div className="sizes" aria-label="Brush size">
              {[5, 10, 22].map((size, i) => (
                <button
                  key={size}
                  aria-label={`${["Fine", "Medium", "Broad"][i]} brush`}
                  aria-pressed={drawing.pencilSize === size}
                  disabled={!isDrawing}
                  onClick={() => dispatch({ type: "setPencilSize", size })}
                >
                  <span style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <aside className="interview">
          {isDrawing ? (
            <>
              <div className="interview-heading">
                <span className="eyebrow">THE WORD ON THE STREET</span>
                <span className="clue-count">
                  {round.clue + 1} / {brief.witnesses.length}
                </span>
              </div>
              <div className="witness-card" key={round.clue}>
                <div className={`witness-portrait witness-${witness.id}`}>
                  {WITNESS_IMAGE[witness.id] ? (
                    <img
                      src={WITNESS_IMAGE[witness.id]}
                      alt={`${witness.name}, ${witness.role}`}
                    />
                  ) : (
                    <span aria-hidden="true">“</span>
                  )}
                  <div>
                    <h2>{witness.name}</h2>
                    <p>{witness.role}</p>
                  </div>
                  <span className="quote-mark" aria-hidden="true">
                    “
                  </span>
                </div>
                <blockquote>{witness.text}</blockquote>
              </div>
              <div className="clue-actions">
                <div className="clue-tabs" aria-label="Witness clues">
                  {brief.witnesses.map((w, i) => (
                    <button
                      key={i}
                      aria-label={`Read clue ${i + 1} from ${w.name}`}
                      aria-pressed={round.clue === i}
                      onClick={() => send({ type: "clue", index: i })}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  className="next-clue"
                  onClick={() =>
                    send({
                      type: "clue",
                      index: (round.clue + 1) % brief.witnesses.length,
                    })
                  }
                >
                  {round.clue < brief.witnesses.length - 1
                    ? "Next witness"
                    : "Read again"}{" "}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="finish-area">
                <p>
                  {round.furthest < brief.witnesses.length - 1
                    ? "You can draw while you listen."
                    : "That’s everyone. Make of it what you will."}
                </p>
                <button
                  className="btn btn-primary"
                  disabled={opening}
                  onClick={finish}
                >
                  Done with my sketch <span aria-hidden="true">↗</span>
                </button>
                <span className="round-mode">
                  {live
                    ? "Online case · AI likeness available"
                    : "Unscored practice · reveal included"}
                </span>
              </div>
              <details className="desk-help">
                <summary>A couple of drawing tips</summary>
                <p>
                  Tap a color and draw. Use Erase for little mistakes, Undo for
                  big ones. Two-finger tap also undoes. Keyboard: ⌘/Ctrl Z,
                  Shift to redo.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={graphite}
                    onChange={(e) => setGraphite(e.target.checked)}
                  />{" "}
                  Softer graphite strokes
                </label>
                <p>
                  {brief.drawingMode === "monochrome"
                    ? "This is a monochrome case; missing color never counts against you."
                    : "Colors are clues too. Simple shapes are plenty."}
                </p>
              </details>
            </>
          ) : (
            <div className="finish-panel" ref={finishRef} tabIndex={-1}>
              <span className="eyebrow">PENCILS DOWN?</span>
              <h2>
                {round.phase === "judging"
                  ? "Checking the case…"
                  : "Ready for the big reveal?"}
              </h2>
              <p>
                {round.phase === "judging"
                  ? "Your sketch is kept here while we wait. No result yet."
                  : drawing.strokes.length === 0
                    ? "An empty canvas is a bold interpretation. You can still go back and draw."
                    : "Your sketch is ready. Let’s see who the witnesses were talking about."}
              </p>
              {round.phase === "finishing" && (
                <>
                  {round.error && (
                    <p role="alert" className="submission-error">
                      {round.error} Your sketch is still here.
                    </p>
                  )}
                  {live && (
                    <>
                      <p className="judge-consent">
                        Get an AI likeness estimate: your sketch is sent to
                        Anthropic and saved with this round. AI judgments can
                        vary.
                      </p>
                      <TurnstileWidget
                        key={round.error || "first"}
                        onToken={setToken}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={() => submit(true)}
                      >
                        {round.error ? "Retry AI judging" : "Get AI likeness"}
                      </button>
                    </>
                  )}
                  <button
                    className={`btn ${live ? "btn-outline" : "btn-primary"}`}
                    onClick={() => submit(false)}
                  >
                    {live ? "Reveal without a score" : "Meet the suspect"}{" "}
                    <span aria-hidden="true">↗</span>
                  </button>
                  <button
                    className="back-to-sketch"
                    onClick={() => send({ type: "edit" })}
                  >
                    Back to my sketch
                  </button>
                  <button className="back-to-sketch" onClick={download}>
                    Save a copy of my sketch
                  </button>
                </>
              )}
              {round.phase === "judging" && (
                <div
                  className="waiting-dots"
                  aria-label="Waiting for the server"
                >
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      <p className="play-footnote">
        Fictional suspects. Real creative license.{" "}
        <span>
          Your practice sketch stays in this tab unless you save or submit it.
        </span>
      </p>
    </>
  );
}
