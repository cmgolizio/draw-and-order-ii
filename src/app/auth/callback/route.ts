import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth + magic-link landing (Phase 5). Exchanges the provider's PKCE code
 * (Google OAuth, and magic links using the default {{ .ConfirmationURL }}
 * template) or verifies an emailed token hash (templates customized to
 * {{ .TokenHash }}), sets the session cookies, and bounces to `next`
 * (same-origin paths only).
 */
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
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) return NextResponse.redirect(`${origin}${next}`);
    }
  } catch (error) {
    console.error(
      "[auth] callback failed:",
      error instanceof Error ? error.message : error,
    );
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}