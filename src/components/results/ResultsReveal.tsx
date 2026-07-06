"use client";

/**
 * The payoff moment (Phase 7): evidence slides out of the folder, the score
 * gets stamped on with a thud, the trait breakdown reads like a forensic
 * checklist, and the stroke log replays the sketch start-to-finish.
 *
 * All entrance animation is CSS behind prefers-reduced-motion — with reduced
 * motion the page renders settled and complete. The thud only fires from the
 * stamp animation's end, so reduced motion also means no surprise audio.
 */
import { useState } from "react";
import { track } from "@vercel/analytics";
import { StrokeReplay } from "@/components/results/StrokeReplay";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import {
  buildShareText,
  caseNumber,
  formatScore,
  TRAIT_LABELS,
  type RoundResult,
} from "@/lib/game/round-result";
import { TRAIT_KEYS, TRAIT_WEIGHTS } from "@/lib/game/scoring";
import { playStampThud } from "@/lib/sound";

/** Stagger (ms): photos slide out, then the stamp slams, then the report. */
const DELAY = {
  suspect: 100,
  sketch: 260,
  stamp: 700,
  report: 1000,
  checklist: 1150,
} as const;

export function ResultsReveal({ result }: { result: RoundResult }) {
  const [replaying, setReplaying] = useState(false);
  const [replayRun, setReplayRun] = useState(0);
  const [copied, setCopied] = useState(false);

  const number = caseNumber(result);

  async function handleShare() {
    const text = buildShareText(result, window.location.href);
    track("share_clicked", { mode: result.mode });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      // Share sheet dismissed — fall through to the clipboard.
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable; the button simply stays put.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header: case number + the stamped verdict */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <TypewriterHeading as="h1" className="text-2xl sm:text-3xl">
            Forensic report
          </TypewriterHeading>
          <p className="type-label mt-1 text-xs text-ink-faint">
            Case {number} · filed by {result.handle}
          </p>
        </div>
        <div
          className="anim-stamp"
          style={{ "--reveal-delay": `${DELAY.stamp}ms` } as React.CSSProperties}
          onAnimationEnd={(e) => {
            if (e.currentTarget === e.target) playStampThud();
          }}
        >
          {result.forfeited ? (
            <Stamp color="blue" className="text-xl">
              Forfeited
            </Stamp>
          ) : (
            <Stamp color="red" className="text-2xl" seed={result.roundId}>
              {result.score !== null ? formatScore(result.score) : "—"} / 100
            </Stamp>
          )}
        </div>
      </div>

      {/* The reveal: suspect vs. sketch, pinned side by side */}
      <div className="grid gap-5 sm:grid-cols-2">
        <PinnedEvidence
          label="The suspect"
          tilt="-1.2deg"
          delay={DELAY.suspect}
        >
          {result.suspectImageUrl ? (
            // Short-lived signed URL — plain img, no optimizer proxy.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.suspectImageUrl}
              alt="The suspect's portrait, revealed"
              className="w-full bg-paper"
              style={{ aspectRatio: "800 / 1040", objectFit: "cover" }}
            />
          ) : (
            <MissingEvidence label="Photo link expired — refresh the page" />
          )}
        </PinnedEvidence>

        <PinnedEvidence label="Your sketch" tilt="1.4deg" delay={DELAY.sketch}>
          {replaying && result.strokeLog ? (
            <StrokeReplay
              key={replayRun}
              strokeLog={result.strokeLog}
              onDone={() => setReplaying(false)}
            />
          ) : result.drawingUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.drawingUrl}
              alt="The sketch filed for this case"
              className="w-full bg-paper"
              style={{ aspectRatio: "800 / 1040", objectFit: "cover" }}
            />
          ) : (
            <MissingEvidence label="No sketch filed" />
          )}
          {result.strokeLog && (
            <div className="mt-2 flex justify-end">
              <InkButton
                variant="blue"
                className="!px-3 !py-1.5 !text-xs"
                onClick={() => {
                  setReplaying(true);
                  setReplayRun((n) => n + 1);
                }}
                disabled={replaying}
              >
                {replaying ? "Sketching…" : "Replay sketch"}
              </InkButton>
            </div>
          )}
        </PinnedEvidence>
      </div>

      {/* The judge's case report, typed up */}
      {result.breakdown && (
        <blockquote
          className="texture-grain anim-fade font-typewriter border border-graphite-200 bg-paper p-4 text-sm leading-relaxed text-ink-soft shadow-folder"
          style={{ "--reveal-delay": `${DELAY.report}ms` } as React.CSSProperties}
        >
          “{result.breakdown.caseReport}”
        </blockquote>
      )}

      {result.forfeited && (
        <p className="max-w-prose text-sm text-ink-soft">
          You turned yourself in — no score on a forfeited case, and it stays
          off the leaderboard. The face is above; study it for next time.
        </p>
      )}

      {/* Forensic checklist */}
      {result.breakdown && (
        <section
          aria-label="Trait breakdown"
          className="anim-fade"
          style={
            { "--reveal-delay": `${DELAY.checklist}ms` } as React.CSSProperties
          }
        >
          <TypewriterHeading as="h2" className="mb-3 text-base">
            Trait analysis
          </TypewriterHeading>
          <ul className="flex flex-col gap-2">
            {TRAIT_KEYS.map((key, index) => {
              const value = result.breakdown!.traits[key];
              const isBest = result.breakdown!.bestFeature === key;
              const isMiss = result.breakdown!.biggestMiss === key;
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
                      className="anim-meter h-full bg-ink-soft"
                      style={
                        {
                          width: `${value}%`,
                          "--reveal-delay": `${DELAY.checklist + index * 70}ms`,
                        } as React.CSSProperties
                      }
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
            {result.breakdown.usedGuide && " · silhouette guide used: ×0.95"} ·
            difficulty ×{result.breakdown.multipliers.difficulty}
          </p>
        </section>
      )}

      {/* The statement this sketch was drawn from */}
      <details className="anim-fade" style={{ "--reveal-delay": `${DELAY.checklist}ms` } as React.CSSProperties}>
        <summary className="type-label cursor-pointer text-xs text-ink-soft">
          The witness statement
        </summary>
        <blockquote className="texture-grain mt-2 border border-graphite-200 bg-paper p-4 text-sm leading-relaxed text-ink-soft">
          “{result.statement}”
        </blockquote>
      </details>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3 border-t border-graphite-200 pt-4">
        {!result.forfeited && (
          <InkButton variant="blue" onClick={handleShare} aria-live="polite">
            {copied ? "Copied to clipboard" : "Share this case"}
          </InkButton>
        )}
        <InkButton variant="red" href="/draw">
          Open a new case
        </InkButton>
        <InkButton variant="ink" href="/daily">
          Today&rsquo;s case
        </InkButton>
        <SoundToggle className="ml-auto" />
      </div>
    </div>
  );
}

function PinnedEvidence({
  label,
  tilt,
  delay,
  children,
}: {
  label: string;
  tilt: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <figure
      className="anim-reveal relative"
      style={
        {
          "--reveal-tilt": tilt,
          "--reveal-delay": `${delay}ms`,
        } as React.CSSProperties
      }
    >
      <figcaption className="mb-2">
        <EvidenceTag>{label}</EvidenceTag>
      </figcaption>
      <div className="relative border-6 border-paper bg-paper shadow-folder-lg">
        <span
          aria-hidden
          className="absolute -top-3 left-1/2 z-10 size-3 -translate-x-1/2 rounded-full border border-stamp-red-deep bg-stamp-red shadow-sm"
        />
        {children}
      </div>
    </figure>
  );
}

function MissingEvidence({ label }: { label: string }) {
  return (
    <div
      className="flex w-full items-center justify-center border border-dashed border-graphite-300 bg-manila-50"
      style={{ aspectRatio: "800 / 1040" }}
    >
      <span className="type-label px-4 text-center text-xs text-ink-faint">
        {label}
      </span>
    </div>
  );
}