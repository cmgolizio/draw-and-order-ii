import type { Metadata } from "next";
import { LoginSheet } from "@/components/auth/LoginSheet";
import { CaseFolder } from "@/components/ui/CaseFolder";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

export const metadata: Metadata = {
  title: "Sign In",
};

/** Auth (Phase 5): Google OAuth + magic link only, via Supabase Auth. */
export default function LoginPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <CaseFolder tab="Precinct Sign-In Sheet">
        <div className="flex flex-col gap-5">
          <TypewriterHeading as="h1" className="text-3xl">
            Sign in
          </TypewriterHeading>
          <LoginSheet />
        </div>
      </CaseFolder>
    </div>
  );
}