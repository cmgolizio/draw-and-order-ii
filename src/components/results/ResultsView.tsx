"use client";

/**
 * Round results (Phase 4, minimal): reads the submit/forfeit payload the draw
 * flow stashed in sessionStorage. Phase 7 replaces this with the full payoff
 * (server-fetched rounds, animated reveal, stroke replay, share card) — this
 * version proves the loop: score, breakdown, case report, side-by-side.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  RESULT_STORAGE_PREFIX,
  type RoundResultPayload,
} from "@/lib/game/api-types";
import { TRAIT_KEYS, TRAIT_WEIGHTS, type TraitKey } from "@/lib/game/scoring";
import { ShareBlock } from "@/components/results/ShareBlock";
import { SignupNudge } from "@/components/results/SignupNudge";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

const TRAIT_LABELS: Record<TraitKey, string> = {
  faceShape: "Face shape",
  proportions: "Proportions",
  hairStyle: "Hair",
  eyebrows: "Eyebrows",
  eyes: "Eyes",
  nose: "Nose",
  mouth: "Mouth",
  distinctiveMarks: "Distinctive marks",
};

/** Pre-hydration marker so the server render shows "loading", not "sealed". */
const SSR_SENTINEL = "ssr";
const subscribeNoop = () => () => {};

function readStoredResult(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function ResultsView({ roundId }: { roundId: string }) {
  const storageKey = RESULT_STORAGE_PREFIX + roundId;
  // One-time client-storage read, hydration-safe (no setState-in-effect).
  const raw = useSyncExternalStore(
    subscribeNoop,
    () => readStoredResult(storageKey),
    () => SSR_SENTINEL,
  );

  const payload = useMemo<RoundResultPayload | null>(() => {
    if (raw === SSR_SENTINEL || raw === null) return null;
    try {
      return JSON.parse(raw) as RoundResultPayload;
    } catch {
      return null;
    }
  }, [raw]);

  if (raw === SSR_SENTINEL) {
    return (
      <CaseFolder tab="Case Report">
        <p className="type-label animate-pulse py-10 text-center text-sm text-ink-faint">
          Pulling the file…
        </p>
      </CaseFolder>
    );
  }

  if (!payload) {
    return (
      <CaseFolder tab="Case Report">
        <div className="flex flex-col items-start gap-4 py-6">
          <Stamp color="blue">Sealed</Stamp>
          <TypewriterHeading as="h1" className="text-2xl sm:text-3xl">
            Case file sealed
          </TypewriterHeading>
          <p className="max-w-prose text-sm text-ink-soft">
            Reports are only on the desk right after a sketch is filed —
            this one has been boxed up. Durable case history arrives with
            detective accounts.
          </p>
          <InkButton variant="red" href="/draw">
            Open a new case
          </InkButton>
        </div>
      </CaseFolder>
    );
  }

  return (
    <CaseFolder tab="Case Report" bodyClassName="p-4 sm:p-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TypewriterHeading as="h1" className="text-2xl sm:text-3xl">
            Forensic report
          </TypewriterHeading>
          {payload.forfeited ? (
            <Stamp color="blue" className="text-lg">
              Forfeited
            </Stamp>
          ) : (
            <Stamp color="red" className="text-xl" seed={payload.roundId}>
              {formatScore(payload.score)} / 100
            </Stamp>
          )}
        </div>

        {payload.breakdown && (
          <blockquote className="texture-grain font-typewriter border border-graphite-200 bg-paper p-4 text-sm leading-relaxed text-ink-soft shadow-folder">
            “{payload.breakdown.caseReport}”
          </blockquote>
        )}

        {/* The reveal: suspect vs. sketch, pinned side by side */}
        <div className="grid gap-4 sm:grid-cols-2">
          <figure className="flex flex-col gap-2">
            <EvidenceTag>The suspect</EvidenceTag>
            {payload.suspectImageUrl ? (
              // Short-lived signed URL — plain img, no optimizer proxy.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={payload.suspectImageUrl}
                alt="The suspect's portrait, revealed"
                className="w-full border border-graphite-200 bg-paper shadow-folder"
                style={{ aspectRatio: "800 / 1040", objectFit: "cover" }}
              />
            ) : (
              <MissingEvidence label="Photo link expired" />
            )}
            <figcaption className="text-[11px] text-ink-faint">
              Evidence photo link expires shortly after reveal.
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <EvidenceTag>Your sketch</EvidenceTag>
            {payload.drawingDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={payload.drawingDataUrl}
                alt="Your sketch of the suspect"
                className="w-full border border-graphite-200 bg-paper shadow-folder"
                style={{ aspectRatio: "800 / 1040", objectFit: "cover" }}
              />
            ) : (
              <MissingEvidence label="No sketch filed" />
            )}
          </figure>
        </div>

        {payload.breakdown ? (
          <section aria-label="Trait breakdown">
            <TypewriterHeading as="h2" className="mb-3 text-base">
              Trait analysis
            </TypewriterHeading>
            <ul className="flex flex-col gap-2">
              {TRAIT_KEYS.map((key) => {
                const value = payload.breakdown!.traits[key];
                const isBest = payload.breakdown!.bestFeature === key;
                const isMiss = payload.breakdown!.biggestMiss === key;
                return (
                  <li key={key} className="flex items-center gap-3">
                    <span className="type-label w-36 shrink-0 text-xs text-ink-soft">
                      {TRAIT_LABELS[key]}
                    </span>
                    <div
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={value}
                      aria-label={`${TRAIT_LABELS[key]}: ${value} out of 100`}
                      className="h-3 flex-1 border border-graphite-300 bg-paper"
                    >
                      <div
                        className="h-full bg-ink-soft"
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="font-typewriter w-8 shrink-0 text-right text-xs text-ink-soft">
                      {value}
                    </span>
                    <span className="w-14 shrink-0">
                      {isBest && (
                        <Stamp color="blue" className="!text-[9px]" seed={key}>
                          Best
                        </Stamp>
                      )}
                      {isMiss && (
                        <Stamp color="red" className="!text-[9px]" seed={key}>
                          Miss
                        </Stamp>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-ink-faint">
              Weighted for likeness: marks ×{TRAIT_WEIGHTS.distinctiveMarks},
              hair ×{TRAIT_WEIGHTS.hairStyle}
              {payload.breakdown.usedGuide &&
                " · silhouette guide used: ×0.95"}{" "}
              · difficulty ×{payload.breakdown.multipliers.difficulty}
            </p>
          </section>
        ) : (
          <p className="max-w-prose text-sm text-ink-soft">
            You turned yourself in — no score on a forfeited case, and it
            stays off the leaderboard. The face is above; study it for next
            time.
          </p>
        )}

        <ShareBlock payload={payload} />

        <SignupNudge score={payload.score} />

        <div className="flex flex-wrap items-center gap-3 border-t border-graphite-200 pt-4">
          <InkButton variant="red" href="/draw">
            Open a new case
          </InkButton>
          <EvidenceTag className="max-w-full">
            <span className="truncate">Round {payload.roundId}</span>
          </EvidenceTag>
        </div>
      </div>
    </CaseFolder>
  );
}

function MissingEvidence({ label }: { label: string }) {
  return (
    <div
      className="flex w-full items-center justify-center border border-dashed border-graphite-300 bg-manila-50"
      style={{ aspectRatio: "800 / 1040" }}
    >
      <span className="type-label text-xs text-ink-faint">{label}</span>
    </div>
  );
}

function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score * 10) / 10}`;
}