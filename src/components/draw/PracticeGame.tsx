"use client";

/**
 * The practice round flow (Phase 4): open a case via POST /api/rounds
 * (Turnstile-gated), draw, then submit for judging or turn yourself in.
 * Results are stashed in sessionStorage and shown on /results/[roundId];
 * finished rounds are mirrored into local history (Phase 5).
 *
 * The Phase 3 demo case remains the zero-backend fallback: if the precinct
 * is unreachable the player can still sketch against the training file.
 */
import { useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { errorMessage, openRound } from "@/lib/game/round-client";
import type { Difficulty } from "@/lib/game/trait-sheet";
import { DEMO_BRIEFING, type DrawBriefing } from "@/lib/draw/demoCase";
import { DrawWorkspace } from "@/components/draw/DraftWorkspace";
import { TurnstileWidget } from "@/components/draw/TurnstileWidget";
import { useRoundActions } from "@/components/draw/useRoundActions";
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

export function PracticeGame() {
  const [briefing, setBriefing] = useState<DrawBriefing | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("detective");
  const turnstileToken = useRef<string | null>(null);
  const { busy, setBusy, error, setError, handleSubmit, handleForfeit } =
    useRoundActions(briefing);

  async function openCase() {
    setBusy("opening");
    setError(null);
    try {
      const data = await openRound({
        mode: "practice",
        difficulty,
        turnstileToken: turnstileToken.current ?? undefined,
      });
      setBriefing({
        source: "live",
        roundId: data.roundId,
        mode: data.mode,
        dailyDate: data.dailyDate,
        difficulty: data.difficulty,
        statement: data.statement,
        statementTeaser: data.statementTeaser,
        silhouetteUrl: data.silhouetteUrl,
      });
    } catch (e) {
      setError(
        errorMessage(
          e,
          "Couldn't reach the precinct. Try again — or take the training case.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  function openDemoCase() {
    setError(null);
    setBriefing({ ...DEMO_BRIEFING, silhouetteUrl: null });
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