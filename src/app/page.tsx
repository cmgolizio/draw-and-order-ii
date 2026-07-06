import { CaseFolder } from "@/components/ui/CaseFolder";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { Tape } from "@/components/ui/motifs";
import { DEMO_BRIEFING } from "@/lib/draw/demoCase";
import {
  getDailyLeaderboardSnippet,
  getLandingHero,
} from "@/lib/server/landing";

/**
 * The landing page, rebuilt honest (Phase 7): a REAL witness statement and a
 * real (sealed, unidentifiable) suspect thumbnail from the live pool, and a
 * leaderboard snippet that only appears once real scores exist. No fake
 * testimonials, no invented numbers, no dead links.
 */

// Refresh the hero case + leaderboard snippet every 5 minutes.
export const revalidate = 300;

const STEPS = [
  {
    tag: "Step 1",
    title: "Read the statement",
    body: "A witness saw the suspect. Their statement is all you get — no photo, no lineup.",
    tilt: "-2.5deg",
    art: (
      <g>
        <rect x="10" y="6" width="44" height="52" rx="1" />
        <path d="M17 16h30M17 23h30M17 30h22M17 37h26M17 44h14" />
        <path d="M46 44l6 6M52 44l-6 6" />
      </g>
    ),
  },
  {
    tag: "Step 2",
    title: "Sketch the face",
    body: "Pencil, eraser, one sheet of paper. Draw the face the statement describes.",
    tilt: "1.5deg",
    art: (
      <g>
        <ellipse cx="30" cy="30" rx="16" ry="20" />
        <path d="M23 26c1.5-2 5-2 6 0M35 26c1.5-2 5-2 6 0M30 28v8m-4 6c2 2 6 2 8 0" />
        <path d="M48 52L58 42l-4-4-10 10-1 5z" />
      </g>
    ),
  },
  {
    tag: "Step 3",
    title: "Face the judge",
    body: "The forensic AI compares your sketch to the real suspect and files a report.",
    tilt: "-1.2deg",
    art: (
      <g>
        <circle cx="26" cy="26" r="14" />
        <path d="M36 36l14 14" strokeWidth="4" />
        <ellipse cx="26" cy="26" rx="6" ry="8" />
        <path d="M44 10h14v10" />
      </g>
    ),
  },
] as const;

export default async function HomePage() {
  const [hero, leaderboard] = await Promise.all([
    getLandingHero(),
    getDailyLeaderboardSnippet(),
  ]);

  const statement = hero?.statement ?? DEMO_BRIEFING.statement;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      {/* Hero: an open case folder with real evidence in it */}
      <CaseFolder tab="Case File · Open" paperClip>
        <div className="flex flex-col gap-8 md:flex-row md:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <Stamp color="red">Confidential</Stamp>
              <Stamp color="blue" className="hidden sm:inline-block">
                Precinct copy
              </Stamp>
            </div>
            <TypewriterHeading as="h1" className="text-4xl sm:text-6xl">
              Draw &amp; Order
            </TypewriterHeading>
            <p className="max-w-prose text-lg text-ink-soft">
              The witness saw everything. You have their statement, a pencil,
              and one shot at the sketch. Draw the suspect — the forensic AI
              decides if it holds up in court.
            </p>
            <div className="flex flex-wrap gap-3">
              <InkButton href="/daily" variant="red">
                Open today&rsquo;s case
              </InkButton>
              <InkButton href="/draw" variant="ink">
                Practice sketching
              </InkButton>
            </div>
          </div>

          {/* Real evidence from the live pool: statement + sealed thumbnail */}
          <div className="w-full shrink-0 md:w-80">
            <div className="relative flex flex-col gap-3 border border-graphite-200 bg-paper p-4 pt-5 shadow-folder">
              <Tape />
              <EvidenceTag>
                {hero
                  ? "From an open case file"
                  : "Training file · demo case"}
              </EvidenceTag>
              <blockquote className="font-typewriter text-sm leading-relaxed text-ink-soft">
                “{statement}”
              </blockquote>
              <figure className="relative mx-auto w-36">
                {hero?.blurThumb ? (
                  <div className="overflow-hidden border-4 border-paper shadow-folder">
                    {/* A ~24px smear, upscaled — the real photo never ships. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={hero.blurThumb}
                      alt="Heavily blurred suspect photo, sealed until you play"
                      className="w-full scale-110 blur-[6px]"
                      style={{ aspectRatio: "800 / 1040" }}
                    />
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center border border-dashed border-graphite-300 bg-manila-50"
                    style={{ aspectRatio: "800 / 1040" }}
                  >
                    <span className="type-label text-[10px] text-ink-faint">
                      Photo withheld
                    </span>
                  </div>
                )}
                <figcaption className="absolute inset-0 flex items-center justify-center">
                  <Stamp color="red" seed="sealed-evidence">
                    Sealed
                  </Stamp>
                </figcaption>
              </figure>
              <p className="text-center text-[11px] text-ink-faint">
                The face stays sealed until your sketch is filed.
              </p>
            </div>
          </div>
        </div>
      </CaseFolder>

      {/* How-it-works: evidence photos pinned to a corkboard */}
      <section aria-labelledby="how-it-works" className="mt-14">
        <TypewriterHeading as="h2" className="text-xl">
          <span id="how-it-works">How a case goes down</span>
        </TypewriterHeading>
        <div className="texture-grain mt-6 rounded-md border-8 border-kraft-700 bg-kraft-500/70 p-6 shadow-folder sm:p-8">
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step) => (
              <div
                key={step.tag}
                className="relative bg-paper p-3 pb-4 shadow-folder-lg"
                style={{ transform: `rotate(${step.tilt})` }}
              >
                <span
                  aria-hidden
                  className="absolute -top-2 left-1/2 z-10 size-3 -translate-x-1/2 rounded-full border border-stamp-red-deep bg-stamp-red shadow-sm"
                />
                <div className="flex items-center justify-center border border-graphite-200 bg-manila-50 py-4">
                  <svg
                    aria-hidden
                    viewBox="0 0 64 64"
                    className="h-20 w-20 text-ink-soft"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {step.art}
                  </svg>
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  <EvidenceTag>{step.tag}</EvidenceTag>
                  <h3 className="type-label text-sm font-bold text-ink">
                    {step.title}
                  </h3>
                  <p className="text-sm text-ink-soft">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Today's board — real data only, hidden until scores exist */}
      {leaderboard.length > 0 && (
        <section aria-labelledby="daily-board" className="mt-14">
          <TypewriterHeading as="h2" className="text-xl">
            <span id="daily-board">Today&rsquo;s board</span>
          </TypewriterHeading>
          <div className="texture-grain mt-6 border border-kraft-400 bg-manila-100 p-5 shadow-folder">
            <ol className="flex flex-col gap-2">
              {leaderboard.map((row) => (
                <li
                  key={row.rank}
                  className="flex items-baseline gap-3 border-b border-dashed border-graphite-200 pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  <span className="font-typewriter w-6 shrink-0 text-right text-ink-faint">
                    {row.rank}.
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {row.handle}
                  </span>
                  <span className="font-typewriter shrink-0 text-ink-soft">
                    {row.finalScore}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <InkButton href="/daily" variant="red">
                Take today&rsquo;s case
              </InkButton>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}