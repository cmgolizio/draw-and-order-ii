import { z } from "zod";

/**
 * Environment access, validated with zod.
 *
 * `NEXT_PUBLIC_*` vars are inlined at build time, so they must be referenced
 * as static property accesses — never via dynamic lookup.
 */

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  IMAGE_GEN_API_KEY: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().min(1),
});

/** Safe on client and server. Throws with a clear message if unset. */
export function clientEnv() {
  return clientEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

/**
 * Server-only secrets. Validates lazily and per-key so a missing key for a
 * later phase (e.g. TURNSTILE_SECRET_KEY) doesn't block unrelated routes.
 */
export function serverEnv<K extends keyof z.infer<typeof serverEnvSchema>>(
  key: K,
): string {
  const parsed = serverEnvSchema.shape[key].safeParse(process.env[key]);
  if (!parsed.success) {
    throw new Error(`Missing or invalid environment variable: ${key}`);
  }
  return parsed.data;
}