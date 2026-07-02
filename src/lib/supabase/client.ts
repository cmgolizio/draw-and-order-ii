import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/** Browser Supabase client (publishable key, RLS enforced). */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}