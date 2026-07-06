"use client";

/** Clock out (Phase 5): end the Supabase session and head home. */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { InkButton } from "@/components/ui/InkButton";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <InkButton variant='ink' onClick={signOut} disabled={busy}>
      {busy ? "Clocking out…" : "Sign out"}
    </InkButton>
  );
}
