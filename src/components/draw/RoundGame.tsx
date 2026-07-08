"use client";

/**
 * The round flow for both modes: open a case via POST /api/rounds
 * (Turnstile-gated), draw, then submit for judging or turn yourself in.
 * Results live on the durable, server-fetched /results/[roundId] page.
 *
 * Practice keeps the Phase 3 demo case as the zero-backend fallback. Daily
 * adds the one-attempt handling: an already-filed case shows the report link
 * and the countdown to the next bulletin.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { cx } from "@/lib/cx";
import type {
  ApiErrorBody,
  CreateRoundResponse,
  SubmitRoundResponse,
  RevealRoundResponse,
} from "@/lib/game/api-types";
import { getOrCreateAnonId } from "@/lib/game/anon-id";
import type { Difficulty } from "@/lib/game/trait-sheet";
import { DEMO_BRIEFING, type DrawBriefing } from "@/lib/draw/demoCase";
import { DrawWorkspace, type SubmitArgs } from "@/components/draw/DraftWorkspace";
import { TurnstileWidget } from "@/components/draw/TurnstileWidget";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
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

/** Daily-mode terminal states: already filed, or no case on the board. */
type DailyLockout =
  | { kind: "played"; roundId: string | null }
  | { kind: "no_case"; message: string };

async function readApiBody(res: Response): Promise<Partial<ApiErrorBody>> {
  try {
    return (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    return {};
  }
}

export function RoundGame({ mode }: { mode: "practice" | "daily" }) {
  const router = useRouter();
  const [briefing, setBriefing] = useState<DrawBriefing | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("detective");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<DailyLockout | null>(null);
  const turnstileToken = useRef<string | null>(null);

  async function openCase() {
    setBusy("opening");
    setError(null);
    try {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          difficulty: mode === "practice" ? difficulty : undefined,
          anonId: getOrCreateAnonId(),
          turnstileToken: turnstileToken.current ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await readApiBody(res);
        if (mode === "daily" && body.code === "daily_already_played") {
          setLockout({ kind: "played", roundId: body.roundId ?? null });
          return;
        }
        if (mode === "daily" && body.code === "no_daily_case") {
          setLockout({
            kind: "no_case",
            message:
              body.error ??
              "No case on the board today — check back after the morning briefing.",
          });
          return;
        }
        setError(
          body.error ??
            (mode === "practice"
              ? "Couldn't reach the precinct. Try again — or take the training case."
              : "Couldn't reach the precinct. Try again in a moment."),
        );
        return;
      }
      const data = (await res.json()) as CreateRoundResponse;
      track("round_started", { mode, difficulty: data.difficulty });
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
    } catch {
      setError(
        mode === "practice"
          ? "Couldn't reach the precinct. Try again — or take the training case."
          : "Couldn't reach the precinct. Try again in a moment.",
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
        const body = await readApiBody(res);
        setError(
          body.error ??
            "The examiner couldn't score the sketch. It's saved — try again.",
        );
        setBusy(null);
        return;
      }
      const data = (await res.json()) as SubmitRoundResponse;
      track("round_submitted", {
        mode,
        difficulty: briefing.difficulty,
        score: Math.round(data.score),
      });
      router.push(`/results/${data.roundId}`);
    } catch {
      setError(
        "The submission didn't go through. Your round is still open — try again.",
      );
      setBusy(null);
    }
  }

  async function handleForfeit() {
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
        const body = await readApiBody(res);
        setError(body.error ?? "Couldn't close the case. Try again.");
        setBusy(null);
        return;
      }
      const data = (await res.json()) as RevealRoundResponse;
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

  if (lockout) {
    return (
      <div className="flex flex-col items-start gap-4 py-4">
        {lockout.kind === "played" ? (
          <>
            <Stamp color="blue">Sketch filed</Stamp>
            <p className="max-w-prose text-sm text-ink-soft">
              You&rsquo;ve already filed a sketch on today&rsquo;s case,
              detective. One suspect per day, one attempt per detective.
            </p>
            {lockout.roundId && (
              <InkButton variant="red" href={`/results/${lockout.roundId}`}>
                Read your case report
              </InkButton>
            )}
          </>
        ) : (
          <>
            <Stamp color="blue">Board empty</Stamp>
            <p className="max-w-prose text-sm text-ink-soft">
              {lockout.message}
            </p>
          </>
        )}
        <NextCaseCountdown />
        <InkButton variant="ink" href="/draw">
          Practice while you wait
        </InkButton>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "flex w-full flex-col gap-5 py-4",
        mode === "practice" && "mx-auto max-w-lg",
      )}
    >
      <TypewriterHeading as="h2" className="text-lg">
        {mode === "practice" ? "Pull a case file" : "Take the case"}
      </TypewriterHeading>

      {mode === "practice" ? (
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
      ) : (
        <p className="max-w-prose text-sm text-ink-soft">
          One suspect per day, one attempt per detective. Open the bulletin,
          read the statement, and file the best sketch you&rsquo;ve got.
        </p>
      )}

      <TurnstileWidget onToken={(token) => (turnstileToken.current = token)} />

      <div className="flex flex-wrap items-center gap-3">
        <InkButton
          variant="red"
          onClick={openCase}
          disabled={busy === "opening"}
        >
          {busy === "opening"
            ? "Pulling file…"
            : mode === "practice"
              ? "Open case"
              : "Open today's case"}
        </InkButton>
      </div>

      {error && (
        <div
          role="alert"
          className="border border-stamp-red-deep/40 bg-paper p-3 text-sm text-stamp-red-deep"
        >
          <p>{error}</p>
          {mode === "practice" && (
            <button
              type="button"
              onClick={openDemoCase}
              className="type-label mt-2 cursor-pointer text-xs underline underline-offset-2"
            >
              Use the training case instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Dailies flip at 00:00 UTC; the countdown displays the local wait. */
function NextCaseCountdown() {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      const next = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
      );
      const ms = Math.max(0, next - now.getTime());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setRemaining(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="type-label text-xs text-ink-soft" aria-live="off">
      Next case in{" "}
      <span className="font-typewriter text-base text-ink tabular-nums">
        {remaining ?? "--:--:--"}
      </span>
    </p>
  );
}