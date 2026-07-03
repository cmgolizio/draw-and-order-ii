"use client";

/**
 * Cloudflare Turnstile wrapper (Phase 4 abuse control). Renders the widget
 * when NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured; otherwise renders
 * nothing and reports a null token (keyless local dev — the server skips
 * verification symmetrically when its secret is unset).
 */
import { useEffect, useRef } from "react";
import { turnstileSiteKey } from "@/lib/env";

type TurnstileApi = {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      callback(token: string): void;
      "expired-callback"(): void;
      "error-callback"(): void;
      appearance?: "always" | "execute" | "interaction-only";
    },
  ): string;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile script loaded without api"));
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function TurnstileWidget({
  onToken,
}: {
  /** Called with a fresh token, or null when none is available. */
  onToken(token: string | null): void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Latest-callback ref: the widget renders once but must call the current
  // handler; updating in an effect keeps render pure.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  const siteKey = turnstileSiteKey();

  useEffect(() => {
    if (!siteKey) return;
    const el = containerRef.current;
    if (!el) return;

    let widgetId: string | null = null;
    let cancelled = false;

    loadTurnstile()
      .then((api) => {
        if (cancelled) return;
        widgetId = api.render(el, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} />;
}