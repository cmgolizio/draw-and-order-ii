import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv, serverEnv } from "@/lib/env";

/**
 * Secret-key (admin) client. Bypasses RLS — for trusted server code only
 * (round creation for anonymous players, scoring, signed reveal URLs).
 */
export function createAdminClient() {
  return createSupabaseClient(
    clientEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv("SUPABASE_SECRET_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}