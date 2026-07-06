"use client";

/**
 * The dossier for anonymous detectives (Phase 5): local handle, stats and
 * round history from the localStorage mirror, and the pitch to make it
 * official. Everything here lives in this browser only until signup claims
 * it via /api/migrate-anon.
 */
import { useEffect, useState } from "react";
import {
  getOrCreateLocalHandle,
  readLocalHistory,
  type LocalRound,
} from "@/lib/game/anon-id";
import { caseNumber, localDailyStreak } from "@/lib/game/daily";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { StreakStamps } from "@/components/me/StreakStamps";

type LocalDossier = {
  handle: string;
  history: LocalRound[];
  streak: number;
};

export function AnonDossier() {
  const [dossier, setDossier] = useState<LocalDossier | null>(null);

  useEffect(() => {
    // Deferred a tick: localStorage reads are client-only and the effect
    // body must not set state synchronously.
    const timer = setTimeout(() => {
      const history = readLocalHistory();
      setDossier({
        handle: getOrCreateLocalHandle(),
        history,
        streak: localDailyStreak(history),
      });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  if (!dossier) {
    return (
      <p className="type-label animate-pulse py-10 text-center text-sm text-ink-faint">
        Pulling the file…
      </p>
    );
  }

  const scored = dossier.history.filter((r) => r.score !== null);
  const stats = [
    { label: "Rounds filed", value: String(dossier.history.length) },
    {
      label: "Average score",
      value: scored.length
        ? (
            scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length
          ).toFixed(1)
        : "—",
    },
    {
      label: "Best score",
      value: scored.length
        ? String(Math.max(...scored.map((r) => r.score ?? 0)))
        : "—",
    },
    { label: "Daily streak", value: String(dossier.streak) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Stamp color="blue">Unregistered</Stamp>
        <EvidenceTag>{dossier.handle}</EvidenceTag>
      </div>

      <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
        Your case record
      </TypewriterHeading>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border border-kraft-400 bg-manila-50 p-4"
          >
            <dt className="type-label text-xs text-ink-faint">{stat.label}</dt>
            <dd className="mt-1 font-typewriter text-2xl text-ink">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-label="Daily streak" className="flex flex-col gap-2">
        <h2 className="type-label text-xs text-ink-faint">Streak stamps</h2>
        <StreakStamps streak={dossier.streak} />
      </section>

      <aside className="flex flex-col items-start gap-3 border border-stamp-blue/50 bg-paper p-4">
        <TypewriterHeading as="h2" className="text-base">
          This record lives in this browser only
        </TypewriterHeading>
        <p className="max-w-prose text-sm text-ink-soft">
          Clear your cookies and it&rsquo;s gone, detective. Sign in and your
          anonymous rounds — scores, dailies, streak and all — get claimed
          into a permanent file.
        </p>
        <InkButton variant="blue" href="/login">
          Get your badge
        </InkButton>
      </aside>

      {dossier.history.length > 0 && (
        <section aria-label="Round history">
          <TypewriterHeading as="h2" className="mb-3 text-base">
            Recent cases
          </TypewriterHeading>
          <ul className="flex flex-col divide-y divide-graphite-200 border border-graphite-200 bg-paper">
            {dossier.history.slice(0, 20).map((round) => (
              <li
                key={round.roundId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="type-label text-xs text-ink-soft">
                  {round.mode === "daily" && round.dailyDate
                    ? `Case ${caseNumber(round.dailyDate)}`
                    : `Practice · ${round.difficulty.replace("_", " ")}`}
                </span>
                <span className="text-xs text-ink-faint">
                  {new Date(round.createdAt).toLocaleDateString()}
                </span>
                <span className="font-typewriter text-sm text-ink">
                  {round.forfeited
                    ? "Forfeited"
                    : round.score !== null
                      ? `${Math.round(round.score * 10) / 10} / 100`
                      : "Unscored"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}