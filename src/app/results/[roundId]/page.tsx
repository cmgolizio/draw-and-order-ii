import type { Metadata } from "next";
import { ResultsView } from "@/components/results/ResultsView";

export const metadata: Metadata = {
  title: "Case Report",
};

/**
 * The results page (Phase 4 minimal). Submission = reveal, so the draw flow
 * hands the full result payload over via sessionStorage; Phase 7 rebuilds
 * this as the durable, server-fetched payoff page with the animated reveal.
 */
export default async function ResultsPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <ResultsView roundId={roundId} />
    </div>
  );
}