"use client";

/**
 * The daily case flow (Phase 6): today's APB, one attempt per identity per
 * day (enforced server-side by the partial unique indexes on rounds), a
 * countdown to the next case once played. Reuses the Phase 3/4 draw
 * workspace and the shared submit/forfeit plumbing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { peekAnonId } from "@/lib/game/anon-id";
import type { DailyLeaderboardResponse } from "@/lib/game/api-types";
import { caseNumber, utcDateString } from "@/lib/game/daily";
import {
  errorMessage,
  openRound,
  RoundApiError,
} from "@/lib/game/round-client";
import type { DrawBriefing } from "@/lib/draw/demoCase";
import { DrawWorkspace } from "@/components/draw/DraftWorkspace";
import { TurnstileWidget } from "@/components/draw/TurnstileWidget";
import { useRoundActions } from "@/components/draw/useRoundActions";
import { NextCaseCountdown } from "@/components/daily/NextCaseCountdown";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export function DailyCase() {
  const [info, setInfo] = useState<DailyLeaderboardResponse | null>(null);
  const [infoError, setInfoError] = useState(false);
  const [briefing, setBriefing] = useState<DrawBriefing | null>(null);
  const turnstileToken = useRef<string | null>(null);
  const { busy, setBusy, error, setError, handleSubmit, handleForfeit } =
    useRoundActions(briefing);

  // Promise-chained (not async) so all setState happens in callbacks — this
  // runs from an effect on mount and the effect body must stay pure.
  const loadInfo = useCallback(() => {
    const anonId = peekAnonId();
    const query = anonId ? `?anonId=${anonId}` : "";
    fetch(`/api/daily${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`daily info ${res.status}`);
        const data = (await res.json()) as DailyLeaderboardResponse;
        setInfo(data);
        setInfoError(false);
      })
      .catch(() => {
        setInfo(null);
        setInfoError(true);
      });
  }, []);

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  async function openCase() {
    setBusy("opening");
    setError(null);
    try {
      const data = await openRound({
        mode: "daily",
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
      if (e instanceof RoundApiError && e.code === "daily_already_played") {
        // The server is the referee — refresh the bulletin to the played state.
        loadInfo();
      }
      setError(errorMessage(e, "Couldn't reach the precinct. Try again."));
    } finally {
      setBusy(null);
    }
  }

  // Mid-round: the workspace takes over the bulletin.
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

  const date = info?.date ?? utcDateString();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Stamp color="red">APB</Stamp>
        <Stamp color="blue" seed={`daily-${date}`}>
          Case {caseNumber(date)}
        </Stamp>
        <EvidenceTag>
          {new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
            timeZone: "UTC",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </EvidenceTag>
      </div>

      <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
        Today&rsquo;s suspect
      </TypewriterHeading>

      {info === null && !infoError && (
        <p className="type-label animate-pulse py-6 text-sm text-ink-faint">
          Checking the bulletin board…
        </p>
      )}

      {infoError && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 border border-stamp-red-deep/40 bg-paper p-4"
        >
          <p className="text-sm text-stamp-red-deep">
            Couldn&rsquo;t reach the bulletin board. The precinct may be
            napping — try again.
          </p>
          <InkButton
            variant="ink"
            onClick={() => {
              setInfoError(false);
              loadInfo();
            }}
          >
            Check again
          </InkButton>
        </div>
      )}

      {info && !info.available && (
        <div className="flex flex-col items-start gap-4">
          <p className="max-w-prose text-ink-soft">
            No case on the board today — check back after the morning
            briefing, or sharpen up on a practice file.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <InkButton variant="red" href="/draw">
              Practice instead
            </InkButton>
            <NextCaseCountdown onExpired={loadInfo} />
          </div>
        </div>
      )}

      {info?.available && info.played && (
        <div className="flex flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Stamp color="blue" className="text-lg" seed={info.played.roundId}>
              {info.played.forfeited
                ? "Forfeited"
                : `${Math.round((info.played.score ?? 0) * 10) / 10} / 100`}
            </Stamp>
            <span className="type-label text-xs text-ink-faint">
              Report filed
            </span>
          </div>
          <p className="max-w-prose text-ink-soft">
            You&rsquo;ve already worked today&rsquo;s case, detective — one
            sketch per detective per day. Check the rankings below, or come
            back for tomorrow&rsquo;s bulletin.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <InkButton variant="ink" href="/draw">
              Practice while you wait
            </InkButton>
            <NextCaseCountdown onExpired={loadInfo} />
          </div>
        </div>
      )}

      {info?.available && !info.played && (
        <div className="flex flex-col items-start gap-4">
          <p className="max-w-prose text-ink-soft">
            One suspect per day, one attempt per detective — every sketch on
            today&rsquo;s board drew from the same witness statement.
          </p>
          {info.teaser && (
            <blockquote className="texture-grain font-typewriter border border-graphite-200 bg-paper p-4 text-sm leading-relaxed text-ink-soft shadow-folder">
              Witness recalls: &ldquo;{info.teaser}&rdquo;
            </blockquote>
          )}
          <TurnstileWidget
            onToken={(token) => (turnstileToken.current = token)}
          />
          <InkButton
            variant="red"
            onClick={openCase}
            disabled={busy === "opening"}
          >
            {busy === "opening" ? "Pulling file…" : "Open today's case"}
          </InkButton>
          {error && (
            <p
              role="alert"
              className="border border-stamp-red-deep/40 bg-paper p-3 text-sm text-stamp-red-deep"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}