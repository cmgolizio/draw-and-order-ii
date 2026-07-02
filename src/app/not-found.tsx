import { CaseFolder } from "@/components/ui/CaseFolder";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Records Department">
        <div className="flex flex-col items-start gap-5">
          <Stamp color="red">Case file missing</Stamp>
          <TypewriterHeading as="h1" className="text-3xl">
            404 — no such file
          </TypewriterHeading>
          <p className="text-ink-soft">
            Records has no folder under that number. Misfiled, shredded, or it
            never existed.
          </p>
          <InkButton href="/" variant="ink">
            Back to the front desk
          </InkButton>
        </div>
      </CaseFolder>
    </div>
  );
}