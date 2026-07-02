/**
 * The witness statement, styled as evidence in the case folder. Rendered in
 * the desktop side panel and inside the mobile "Case File" bottom sheet.
 */
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";
import type { DrawBriefing } from "@/lib/draw/demoCase";

const DIFFICULTY_LABEL: Record<DrawBriefing["difficulty"], string> = {
  rookie: "Rookie",
  detective: "Detective",
  cold_case: "Cold case",
};

export function CaseFilePanel({ briefing }: { briefing: DrawBriefing }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <TypewriterHeading as="h2" className="text-base">
          Witness statement
        </TypewriterHeading>
        <Stamp color={briefing.difficulty === "cold_case" ? "blue" : "red"}>
          {DIFFICULTY_LABEL[briefing.difficulty]}
        </Stamp>
      </div>
      <blockquote className="texture-grain border border-graphite-200 bg-paper p-4 text-sm leading-relaxed text-ink-soft shadow-folder">
        “{briefing.statement}”
      </blockquote>
      <EvidenceTag>
        {briefing.source === "demo"
          ? "Training file · demo case"
          : `Case file · ${briefing.statementTeaser}`}
      </EvidenceTag>
    </div>
  );
}