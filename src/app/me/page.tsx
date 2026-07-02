import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "My File",
};

const PLACEHOLDER_STATS = [
  { label: "Rounds filed", value: "—" },
  { label: "Average score", value: "—" },
  { label: "Best score", value: "—" },
  { label: "Daily streak", value: "—" },
] as const;

export default function MePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Personnel Dossier" paperClip>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Stamp color="blue">Active duty</Stamp>
            <EvidenceTag>Det. #0000</EvidenceTag>
          </div>
          <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
            Your case record
          </TypewriterHeading>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {PLACEHOLDER_STATS.map((stat) => (
              <div
                key={stat.label}
                className="border border-kraft-400 bg-manila-50 p-4"
              >
                <dt className="type-label text-xs text-ink-faint">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-typewriter text-2xl text-ink">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-ink-faint">
            Stats, round history, and handle editing arrive in Phase 5.
          </p>
        </div>
      </CaseFolder>
    </div>
  );
}