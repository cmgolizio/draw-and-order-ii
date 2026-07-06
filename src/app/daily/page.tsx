import type { Metadata } from "next";
import { RoundGame } from "@/components/draw/RoundGame";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { utcToday } from "@/lib/server/api";

export const metadata: Metadata = {
  title: "Daily Case",
};

// The case number flips at 00:00 UTC; refresh the bulletin every 5 minutes.
export const revalidate = 300;

/**
 * Today's case, styled as an APB bulletin. One attempt per identity per day —
 * enforced server-side; RoundGame shows the filed-report link and the
 * countdown once you've played.
 */
export default function DailyPage() {
  const caseNo = `Case #${utcToday().replaceAll("-", "")}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <CaseFolder tab="All-Points Bulletin" paperClip bodyClassName="p-4 sm:p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Stamp color="red">APB</Stamp>
            <Stamp color="blue" seed="daily-case-number">
              {caseNo}
            </Stamp>
          </div>
          <div>
            <TypewriterHeading as="h1" className="text-2xl sm:text-4xl">
              Today&rsquo;s suspect
            </TypewriterHeading>
            <p className="mt-1 max-w-prose text-sm text-ink-soft">
              The whole precinct gets the same bulletin. File your best sketch
              — the daily board settles who read the witness right.
            </p>
          </div>
          <RoundGame mode="daily" />
        </div>
      </CaseFolder>
    </div>
  );
}