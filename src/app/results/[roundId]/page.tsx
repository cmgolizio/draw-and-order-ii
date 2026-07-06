import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResultsReveal } from "@/components/results/ResultsReveal";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import { caseNumber, formatScore } from "@/lib/game/round-result";
import { getRoundResult } from "@/lib/server/rounds";

/**
 * The results page (Phase 7): durable and server-fetched — the round lives in
 * Postgres, so the report survives refreshes, new devices, and shared links.
 * A revealed round is visible to anyone holding the unguessable link; an
 * unrevealed round stays sealed, image unsigned.
 */

// Signed URLs are minted per render and rounds flip sealed -> revealed.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ roundId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { roundId } = await params;
  const lookup = await getRoundResult(roundId);

  // Player report pages are share targets, not search results.
  const base: Metadata = { robots: { index: false } };

  if (lookup.state !== "revealed") {
    return { ...base, title: "Case Report" };
  }
  const { result } = lookup;
  const title = `Case Report ${caseNumber(result)}`;
  const description = result.forfeited
    ? "The detective turned themselves in. The suspect walks."
    : `Sketch scored ${result.score !== null ? formatScore(result.score) : "—"}/100 by the forensic examiner. Think you can do better, detective?`;
  return {
    ...base,
    title,
    description,
    openGraph: { title: `${title} · Draw & Order`, description },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ResultsPage({ params }: Props) {
  const { roundId } = await params;
  const lookup = await getRoundResult(roundId);

  if (lookup.state === "missing") notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      {lookup.state === "sealed" ? (
        <CaseFolder tab="Case Report">
          <div className="flex flex-col items-start gap-4 py-6">
            <Stamp color="blue">Sealed</Stamp>
            <TypewriterHeading as="h1" className="text-2xl sm:text-3xl">
              This case is still open
            </TypewriterHeading>
            <p className="max-w-prose text-sm text-ink-soft">
              No sketch has been filed on this case yet, so the report stays
              sealed. If it&rsquo;s yours, head back to the sketch room and
              finish the job.
            </p>
            <InkButton variant="red" href="/draw">
              Back to the sketch room
            </InkButton>
          </div>
        </CaseFolder>
      ) : (
        <CaseFolder tab="Case Report" bodyClassName="p-4 sm:p-6" paperClip>
          <ResultsReveal result={lookup.result} />
        </CaseFolder>
      )}
    </div>
  );
}