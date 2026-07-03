"use client";

/**
 * The practice round flow (Phase 4): open a case via POST /api/rounds
 * (Turnstile-gated), draw, then submit for judging or turn yourself in.
 * Results are stashed in sessionStorage and shown on /results/[roundId].
 *
 * The Phase 3 demo case remains the zero-backend fallback: if the precinct
 * is unreachable the player can still sketch against the training file.
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { cx } from "@/lib/cx";
import type {
  ApiErrorBody,
  CreateRoundResponse,
  RoundResultPayload,
  SubmitRoundResponse,
  RevealRoundResponse,
} from "@/lib/game/api-types.ts";
import { RESULT_STORAGE_PREFIX } from "@/lib/game/api-types";
import { getOrCreateAnonId } from "@/lib/game/anon-id";
import type { Difficulty } from "@/lib/game/trait-sheet.ts";
import { DEMO_BRIEFING, type DrawBriefing } from "@/lib/draw/demoCase";
import { DrawWorkspace, type SubmitArgs } from "@/components/draw/DraftWorkspace";
import { TurnstileWidget } from "@/components/draw/TurnstileWidget";
import { InkButton } from "@/components/ui/InkButton";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

const DIFFICULTY_OPTIONS: {
  value: Difficulty;
  label: string;
  blurb: string;
}[] = [
  {
    value: "rookie",
    label: "Rookie",
    blurb: "The witness got a long, clear look.",
  },
  {
    value: "detective",
    label: "Detective",
    blurb: "A brief look, decent light. Some hedging.",
  },
  {
    value: "cold_case",
    label: "Cold case",
    blurb: "It was dark. It was fast. Good luck.",
  },
];

type Busy = "opening" | "submitting" | "forfeiting" | null;

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export function PracticeGame() {
  const router = useRouter();
  const [briefing, setBriefing] = useState<DrawBriefing | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("detective");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const turnstileToken = useRef<string | null>(null);

  async function openCase() {
    setBusy("opening");
    setError(null);
    try {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "practice",
          difficulty,
          anonId: getOrCreateAnonId(),
          turnstileToken: turnstileToken.current ?? undefined,
        }),
      });
      if (!res.ok) {
        setError(
          await readApiError(
            res,
            "Couldn't reach the precinct. Try again — or take the training case.",
          ),
        );
        return;
      }
      const data = (await res.json()) as CreateRoundResponse;
      setBriefing({
        source: "live",
        roundId: data.roundId,
        mode: data.mode,
        difficulty: data.difficulty,
        statement: data.statement,
        statementTeaser: data.statementTeaser,
        silhouetteUrl: data.silhouetteUrl,
      });
    } catch {
      setError(
        "Couldn't reach the precinct. Try again — or take the training case.",
      );
    } finally {
      setBusy(null);
    }
  }

  function openDemoCase() {
    setError(null);
    setBriefing({ ...DEMO_BRIEFING, silhouetteUrl: null });
  }

  async function handleSubmit({ dataUrl, strokeLog, usedGuide }: SubmitArgs) {
    if (!briefing?.roundId) return;
    setBusy("submitting");
    setError(null);
    try {
      const drawing = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.set("drawing", drawing, "sketch.png");
      form.set("anonId", getOrCreateAnonId());
      form.set("usedGuide", String(usedGuide));
      if (strokeLog) form.set("strokeLog", strokeLog);

      const res = await fetch(`/api/rounds/${briefing.roundId}/submit`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setError(
          await readApiError(
            res,
            "The examiner couldn't score the sketch. It's saved — try again.",
          ),
        );
        setBusy(null);
        return;
      }
      const data = (await res.json()) as SubmitRoundResponse;
      storeResult({
        roundId: data.roundId,
        mode: briefing.mode,
        difficulty: briefing.difficulty,
        statement: briefing.statement,
        forfeited: false,
        score: data.score,
        breakdown: data.breakdown,
        suspectImageUrl: data.suspectImageUrl,
        drawingDataUrl: dataUrl,
        durationSeconds: data.durationSeconds,
      });
      router.push(`/results/${data.roundId}`);
    } catch {
      setError(
        "The submission didn't go through. Your round is still open — try again.",
      );
      setBusy(null);
    }
  }

  async function handleForfeit(drawingDataUrl: string | null) {
    if (!briefing?.roundId) return;
    setBusy("forfeiting");
    setError(null);
    try {
      const res = await fetch(`/api/rounds/${briefing.roundId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId: getOrCreateAnonId() }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Couldn't close the case. Try again."));
        setBusy(null);
        return;
      }
      const data = (await res.json()) as RevealRoundResponse;
      storeResult({
        roundId: data.roundId,
        mode: briefing.mode,
        difficulty: briefing.difficulty,
        statement: briefing.statement,
        forfeited: data.forfeited,
        score: null,
        breakdown: null,
        suspectImageUrl: data.suspectImageUrl,
        drawingDataUrl,
        durationSeconds: null,
      });
      router.push(`/results/${data.roundId}`);
    } catch {
      setError("Couldn't close the case. Try again.");
      setBusy(null);
    }
  }

  if (briefing) {
    return (
      <DrawWorkspace
        briefing={briefing}
        busy={busy}
        submitError={error}
        onSubmit={handleSubmit}
        onForfeit={handleForfeit}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 py-4">
      <TypewriterHeading as="h2" className="text-lg">
        Pull a case file
      </TypewriterHeading>

      <fieldset>
        <legend className="type-label mb-2 text-xs text-ink-faint">
          Difficulty
        </legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {DIFFICULTY_OPTIONS.map((option) => {
            const active = difficulty === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setDifficulty(option.value)}
                className={cx(
                  "flex-1 cursor-pointer border p-3 text-left transition-colors",
                  active
                    ? "border-ink bg-ink text-paper"
                    : "border-graphite-300 bg-paper text-ink-soft hover:bg-manila-50",
                )}
              >
                <span className="type-label block text-xs font-bold">
                  {option.label}
                </span>
                <span
                  className={cx(
                    "mt-1 block text-xs",
                    active ? "text-paper/80" : "text-ink-faint",
                  )}
                >
                  {option.blurb}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <TurnstileWidget onToken={(token) => (turnstileToken.current = token)} />

      <div className="flex flex-wrap items-center gap-3">
        <InkButton
          variant="red"
          onClick={openCase}
          disabled={busy === "opening"}
        >
          {busy === "opening" ? "Pulling file…" : "Open case"}
        </InkButton>
        {/* <span className="text-xs text-ink-faint">
          Welcome, detective.
        </span> */}
      </div>

      {error && (
        <div
          role="alert"
          className="border border-stamp-red-deep/40 bg-paper p-3 text-sm text-stamp-red-deep"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={openDemoCase}
            className="type-label mt-2 cursor-pointer text-xs underline underline-offset-2"
          >
            Use the training case instead
          </button>
        </div>
      )}
    </div>
  );
}

function storeResult(payload: RoundResultPayload) {
  try {
    window.sessionStorage.setItem(
      RESULT_STORAGE_PREFIX + payload.roundId,
      JSON.stringify(payload),
    );
  } catch {
    // Storage full or unavailable — the results page shows its fallback.
  }
}