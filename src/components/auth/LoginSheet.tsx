"use client";

/**
 * The precinct sign-in sheet (Phase 5): Google OAuth or an email magic link.
 * No passwords — they were never invented in this precinct. Signing in never
 * gates play; it just makes the case history permanent (and claims any
 * anonymous rounds via IdentityBoot once the session lands).
 */
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

type Busy = "google" | "magic" | null;

function callbackUrl(): string {
  return `${window.location.origin}/auth/callback?next=/me`;
}

/** One-time read of ?error= from a failed callback bounce, hydration-safe. */
const subscribeNoop = () => () => {};
function readCallbackError(): string | null {
  return new URLSearchParams(window.location.search).get("error");
}

export function LoginSheet() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const callbackError = useSyncExternalStore(
    subscribeNoop,
    readCallbackError,
    () => null,
  );

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }) => {
        setSignedIn(data.session !== null);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        setSignedIn(session !== null);
      });
      return () => sub.subscription.unsubscribe();
    } catch {
      // No Supabase env — the buttons will explain themselves when pressed.
    }
  }, []);

  const displayError =
    error ??
    (!attempted && callbackError
      ? "That sign-in didn't stick. Give it another go, detective."
      : null);

  async function signInWithGoogle() {
    setBusy("google");
    setAttempted(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl() },
      });
      if (authError) throw authError;
      // The browser is being redirected to Google — stay "busy" until then.
    } catch {
      setError("The switchboard couldn't raise Google. Try again.");
      setBusy(null);
    }
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    setBusy("magic");
    setAttempted(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (authError) throw authError;
      setSent(true);
    } catch {
      setError("Couldn't send the magic link. Check the address and retry.");
    } finally {
      setBusy(null);
    }
  }

  if (signedIn) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Stamp color="blue">On duty</Stamp>
        <p className="text-ink-soft">
          You&rsquo;re already signed in, detective. Your case record is on
          file.
        </p>
        <InkButton variant="blue" href="/me">
          Open your file
        </InkButton>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex flex-col items-start gap-4" aria-live="polite">
        <Stamp color="blue">Dispatched</Stamp>
        <TypewriterHeading as="h2" className="text-xl">
          Check your inbox
        </TypewriterHeading>
        <p className="max-w-prose text-sm text-ink-soft">
          A magic link is on its way to{" "}
          <span className="font-typewriter">{email}</span>. Open it in this
          browser and you&rsquo;re on the force.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="type-label cursor-pointer text-xs text-ink-faint underline underline-offset-2"
        >
          Wrong address? Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-ink-soft">
        No badge required to play — signing in just keeps your case history on
        file and puts your name on the board. Any anonymous rounds in this
        browser come with you.
      </p>

      <InkButton
        variant="blue"
        onClick={signInWithGoogle}
        disabled={busy !== null}
      >
        {busy === "google" ? "Raising Google…" : "Continue with Google"}
      </InkButton>

      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-graphite-300" />
        <span className="type-label text-xs text-ink-faint">or</span>
        <span className="h-px flex-1 bg-graphite-300" />
      </div>

      <form onSubmit={sendMagicLink} className="flex flex-col gap-3">
        <label
          htmlFor="login-email"
          className="type-label text-xs text-ink-faint"
        >
          Email on record
        </label>
        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="detective@example.com"
          className="font-typewriter w-full border border-graphite-300 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint/60"
        />
        <InkButton variant="ink" type="submit" disabled={busy !== null}>
          {busy === "magic" ? "Dispatching…" : "Email me a magic link"}
        </InkButton>
      </form>

      {displayError && (
        <p
          role="alert"
          className="border border-stamp-red-deep/40 bg-paper p-3 text-sm text-stamp-red-deep"
        >
          {displayError}
        </p>
      )}

      <p className="text-xs text-ink-faint">
        Passwords were never invented in this precinct.
      </p>
    </div>
  );
}