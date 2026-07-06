"use client";

/**
 * One-time acknowledgment (Phase 7): every face is fictional, entertainment
 * only — plus a short, honest privacy note. Remembered in localStorage;
 * reopenable from the footer link (any close counts as acknowledged).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { InkButton } from "@/components/ui/InkButton";
import { Stamp } from "@/components/ui/Stamp";
import { TypewriterHeading } from "@/components/ui/TypewriterHeading";

const STORAGE_KEY = "dao:consent:v1";
export const OPEN_CONSENT_EVENT = "dao:open-consent";

let ackListeners: Array<() => void> = [];

function subscribeAck(listener: () => void): () => void {
  ackListeners.push(listener);
  window.addEventListener("storage", listener);
  return () => {
    ackListeners = ackListeners.filter((fn) => fn !== listener);
    window.removeEventListener("storage", listener);
  };
}

function readAck(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "ack";
  } catch {
    return true; // storage unavailable — don't nag on every render
  }
}

export function ConsentNotice() {
  // First visit: acked is false after hydration, so the notice shows once.
  // SSR snapshot says acked, so the server renders nothing.
  const acked = useSyncExternalStore(subscribeAck, readAck, () => true);
  const [reopened, setReopened] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const open = !acked || reopened;

  // Footer link reopens the notice at any time.
  useEffect(() => {
    const show = () => setReopened(true);
    window.addEventListener(OPEN_CONSENT_EVENT, show);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, show);
  }, []);

  const acknowledge = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "ack");
    } catch {
      // Fine — they'll see it again next visit.
    }
    ackListeners.forEach((fn) => fn());
    setReopened(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") acknowledge();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, acknowledge]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-ink/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) acknowledge();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-heading"
        tabIndex={-1}
        className="texture-grain w-full max-w-lg rounded-md border border-kraft-500 bg-manila-100 p-6 shadow-folder-lg sm:p-8"
      >
        <div className="flex flex-col items-start gap-4">
          <Stamp color="blue">Read before opening</Stamp>
          <TypewriterHeading as="h2" className="text-xl sm:text-2xl">
            <span id="consent-heading">Every face here is fictional</span>
          </TypewriterHeading>
          <div className="flex flex-col gap-3 text-sm text-ink-soft">
            <p>
              The suspects in these case files are AI-generated faces of
              people who do not exist. Any resemblance to a real person is
              coincidental. This is a drawing game, for entertainment only —
              nothing here is a real investigation or real forensic advice.
            </p>
            <p className="border-t border-kraft-400/60 pt-3">
              <strong className="type-label text-xs">Privacy, briefly:</strong>{" "}
              your sketches and scores are stored privately on our servers so
              your results page works; sketches are never shown publicly. An
              anonymous id lives in your browser&rsquo;s localStorage so you
              can play without an account. If you sign in later, your history
              is linked to your email — that&rsquo;s it. No trackers beyond
              anonymous page analytics.
            </p>
          </div>
          <InkButton variant="red" onClick={acknowledge}>
            Understood — open the files
          </InkButton>
        </div>
      </div>
    </div>
  );
}

/** Footer link that reopens the notice. */
export function ConsentNoticeLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      Fictional faces &amp; privacy
    </button>
  );
}