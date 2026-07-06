import type { NextRequest } from "next/server";
import { z } from "zod";
import { checkHandle } from "@/lib/game/handle";
import { apiError, withRouteErrors } from "@/lib/server/api";
import { ensureProfile } from "@/lib/server/identity";
import { hitLimit, LIMITS } from "@/lib/server/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/profile — handle editing (Phase 5). Runs the profanity filter
 * server-side, which is why direct client writes to profiles are revoked:
 * a filter the client can skip isn't a filter.
 */

const BodySchema = z.object({ handle: z.string().min(1).max(64) });

export const POST = withRouteErrors(updateProfile);

async function updateProfile(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, "bad_request", "Malformed request body.");
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(400, "bad_request", "Malformed request body.");
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return apiError(401, "auth_required", "Sign in to edit your file.");
  }

  const check = checkHandle(parsed.data.handle);
  if (!check.ok) {
    return apiError(
      422,
      check.code === "profanity" ? "handle_rejected" : "handle_invalid",
      check.message,
    );
  }

  const admin = createAdminClient();
  if (!(await hitLimit(admin, LIMITS.profilePerIdentity, `u:${auth.user.id}`))) {
    return apiError(
      429,
      "rate_limited",
      "Easy on the paperwork, detective — try again in a bit.",
    );
  }

  await ensureProfile(admin, auth.user.id);
  const { error } = await admin
    .from("profiles")
    .update({ handle: check.handle })
    .eq("id", auth.user.id);
  if (error) {
    if (error.code === "23505") {
      return apiError(
        409,
        "handle_taken",
        "Another detective already goes by that name.",
      );
    }
    return apiError(500, "server_error", "Couldn't update the roster. Try again.");
  }

  return Response.json({ handle: check.handle });
}