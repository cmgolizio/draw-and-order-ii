import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "Practice",
};

export default function DrawPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Sketch Room">
        <div className="flex flex-col gap-5">
          <TypewriterHeading as="h1" className="text-3xl sm:text-4xl">
            Practice sketch
          </TypewriterHeading>
          <p className="max-w-prose text-ink-soft">
            Pick a difficulty, read the witness statement, and sketch the
            suspect on a clean sheet.
          </p>
          <div
            aria-label="Drawing canvas placeholder"
            className="flex aspect-10/13 max-h-130 w-full max-w-md items-center justify-center border border-graphite-200 bg-paper shadow-folder"
          >
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <Stamp color="ink">Canvas pending</Stamp>
              <p className="text-sm text-ink-faint">
                The sketch surface arrives in Phase 3.
              </p>
            </div>
          </div>
          <EvidenceTag>Exhibit A · your sketch goes here</EvidenceTag>
        </div>
      </CaseFolder>
    </div>
  );
}