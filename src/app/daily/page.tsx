import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "Daily Case",
};

export default function DailyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <CaseFolder tab="All-Points Bulletin" paperClip>
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Stamp color="red">APB</Stamp>
            <Stamp color="blue" seed="daily-case-number">
              Case #········
            </Stamp>
          </div>
          <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
            Today&rsquo;s suspect
          </TypewriterHeading>
          <p className="max-w-prose text-ink-soft">
            One suspect per day, one attempt per detective. The bulletin board
            and daily leaderboard open in Phase 6 — until then this desk stays{" "}
            <span className="redacted">classified as heck</span>.
          </p>
        </div>
      </CaseFolder>
    </div>
  );
}