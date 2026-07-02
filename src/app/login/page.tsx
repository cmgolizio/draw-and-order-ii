import type { Metadata } from "next";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { InkButton } from "@/components/ui/InkButton";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Precinct Sign-In Sheet">
        <div className="flex flex-col gap-5">
          <TypewriterHeading as="h1" className="text-3xl">
            Sign in
          </TypewriterHeading>
          <p className="text-ink-soft">
            No badge required to play — signing in just keeps your case history
            on file. Google or a magic link; passwords were never invented in
            this precinct.
          </p>
          <div className="flex flex-col gap-3">
            <InkButton variant="blue" disabled aria-disabled="true">
              Continue with Google
            </InkButton>
            <InkButton variant="ink" disabled aria-disabled="true">
              Email me a magic link
            </InkButton>
          </div>
          <p className="text-xs text-ink-faint">
            Auth is wired up in Phase 5. Until then, the sign-in sheet is just
            for show.
          </p>
        </div>
      </CaseFolder>
    </div>
  );
}