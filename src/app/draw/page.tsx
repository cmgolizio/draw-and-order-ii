import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { RoundGame } from "@/components/draw/RoundGame";

export const metadata: Metadata = {
  title: "Practice",
};

/**
 * Practice sketching (Phase 4): the round lifecycle lives in RoundGame —
 * rounds are opened through POST /api/rounds (Turnstile-gated, rate-limited)
 * and the suspect image never reaches this page before reveal.
 */
export default function DrawPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <CaseFolder tab="Sketch Room" bodyClassName="p-4 sm:p-6">
        <div className="flex flex-col gap-5">
          <div>
            <TypewriterHeading as="h1" className="text-2xl sm:text-3xl">
              Practice sketch
            </TypewriterHeading>
            <p className="mt-1 max-w-prose text-sm text-ink-soft">
              Read the witness statement, then draw the suspect. Graphite
              only, detective — this precinct doesn&apos;t do color.
            </p>
          </div>
          <RoundGame mode="practice" />
        </div>
      </CaseFolder>
    </div>
  );
}