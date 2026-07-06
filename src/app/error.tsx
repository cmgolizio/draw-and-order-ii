"use client";

/**
 * Route error boundary (Phase 7): "case file missing" theming for anything
 * that crashes during render. Next 16 passes `unstable_retry` (not `reset`)
 * to re-fetch and re-render the segment.
 */
import { useEffect } from "react";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Records Department">
        <div className="flex flex-col items-start gap-5">
          <Stamp color="red">Evidence mishandled</Stamp>
          <TypewriterHeading as="h1" className="text-3xl">
            The file tore
          </TypewriterHeading>
          <p className="text-ink-soft">
            Something went wrong pulling this case up. It&rsquo;s not you —
            the records room dropped the folder. Try again in a moment.
          </p>
          {error.digest && (
            <p className="font-typewriter text-xs text-ink-faint">
              Incident ref: {error.digest}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <InkButton variant="red" onClick={() => unstable_retry()}>
              Try again
            </InkButton>
            <InkButton variant="ink" href="/">
              Back to the front desk
            </InkButton>
          </div>
        </div>
      </CaseFolder>
    </div>
  );
}