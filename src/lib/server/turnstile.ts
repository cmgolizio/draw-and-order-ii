import "server-only";
import { serverEnvIfSet } from "@/lib/env";

/**
 * Server-side Cloudflare Turnstile verification (Phase 4 abuse control).
 * Verified on every round creation.
 *
 * Degraded mode: when TURNSTILE_SECRET_KEY is unset (keyless local dev) the
 * check is SKIPPED with a warning. The Phase 8 launch checklist arms it in
 * prod; the env audit there must confirm the secret is present.
 */

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileVerification =
  | { ok: true; skipped: boolean }
  | { ok: false; message: string };

let warnedSkipped = false;

export async function verifyTurnstile(
  token: string | undefined,
  ip: string | null,
): Promise<TurnstileVerification> {
  const secret = serverEnvIfSet("TURNSTILE_SECRET_KEY");
  if (!secret) {
    if (!warnedSkipped) {
      warnedSkipped = true;
      console.warn(
        "[turnstile] TURNSTILE_SECRET_KEY unset — verification SKIPPED. " +
          "Fine for local dev; must be configured in production.",
      );
    }
    return { ok: true, skipped: true };
  }

  if (!token) {
    return {
      ok: false,
      message: "Human check missing, detective. Refresh and try again.",
    };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const outcome = (await res.json()) as { success?: boolean };
    if (outcome.success === true) return { ok: true, skipped: false };
    return {
      ok: false,
      message: "Human check failed, detective. Refresh and try again.",
    };
  } catch {
    // Fail closed: an unverifiable token never opens a round.
    return {
      ok: false,
      message:
        "Couldn't reach the front desk to verify you're human. Try again in a moment.",
    };
  }
}