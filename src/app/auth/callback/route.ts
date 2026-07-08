import type { EmailOtpType, User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { track } from "@vercel/analytics/server";
import { errorString, logError, logEvent } from "@/lib/server/log";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth + magic-link landing (Phase 5). Exchanges the provider's PKCE code
 * (Google OAuth, and magic links using the default {{ .ConfirmationURL }}
 * template) or verifies an emailed token hash (templates customized to
 * {{ .TokenHash }}), sets the session cookies, and bounces to `next`
 * (same-origin paths only).
 */

/** A sign-in whose account is this fresh IS the signup (Phase 8 analytics). */
const SIGNUP_WINDOW_MS = 5 * 60_000;

async function recordSignIn(user: User | null | undefined): Promise<void> {
  try {
    const isSignup =
      !!user?.created_at &&
      Date.now() - Date.parse(user.created_at) < SIGNUP_WINDOW_MS;
    logEvent("auth_callback", { signup: isSignup });
    if (isSignup) await track("signup");
  } catch {
    // Analytics must never break the login flow.
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next") ?? "/me";
  const next =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/me";

  try {
    const supabase = await createClient();
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        await recordSignIn(data.user);
        return NextResponse.redirect(`${origin}${next}`);
      }
    } else if (tokenHash && type) {
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) {
        await recordSignIn(data.user);
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  } catch (error) {
    logError("auth_callback_failed", { error: errorString(error) });
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}