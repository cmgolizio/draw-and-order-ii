import { CaseFolder } from "@/components/ui/CaseFolder";
import { EvidenceTag } from "@/components/ui/EvidenceTag";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

const STEPS = [
  {
    tag: "Step 1",
    title: "Read the statement",
    body: "A witness saw the suspect. Their statement is all you get — no photo, no lineup.",
  },
  {
    tag: "Step 2",
    title: "Sketch the face",
    body: "Pencil, eraser, one sheet of paper. Draw the face the statement describes.",
  },
  {
    tag: "Step 3",
    title: "Face the judge",
    body: "The forensic AI compares your sketch to the real suspect and files a report.",
  },
] as const;

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Case File · Open" paperClip>
        <div className="flex flex-col gap-6">
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
            The witness saw everything. You have their statement, a pencil, and
            one shot at the sketch. Draw the suspect — the forensic AI decides
            if it holds up in court.
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
      </CaseFolder>

      <section aria-labelledby="how-it-works" className="mt-14">
        <TypewriterHeading as="h2" className="text-xl">
          <span id="how-it-works">How a case goes down</span>
        </TypewriterHeading>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.tag}
              className="texture-grain torn-edge-b border border-kraft-400 bg-manila-100 p-5 pb-7 shadow-folder"
            >
              <EvidenceTag>{step.tag}</EvidenceTag>
              <h3 className="type-label mt-4 text-sm font-bold text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-ink-soft">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}