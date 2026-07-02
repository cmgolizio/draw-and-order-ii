import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "Case Report",
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Case Report">
        <div className="flex flex-col gap-5">
          <Stamp color="blue">Under review</Stamp>
          <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
            Forensic report
          </TypewriterHeading>
          <p className="max-w-prose text-ink-soft">
            The side-by-side reveal, trait breakdown, and the judge&rsquo;s
            case report land here in Phase 7.
          </p>
          <EvidenceTag className="max-w-full">
            <span className="truncate">Round {roundId}</span>
          </EvidenceTag>
        </div>
      </CaseFolder>
    </div>
  );
}