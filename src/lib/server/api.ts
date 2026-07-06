import "server-only";

/**
 * Uniform error body for the game API: { code, error } with an in-theme,
 * player-facing message. Codes are stable for the client to branch on.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
  /** Optional extra fields (e.g. the finished roundId on a daily conflict). */
  extra?: Record<string, unknown>,
): Response {
  return Response.json({ code, error: message, ...extra }, { status });
}

/** Today's date (UTC) as YYYY-MM-DD — dailies flip at a fixed UTC hour. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Last-resort catch for game routes: anything unhandled (missing env, a
 * Supabase outage) becomes an honest JSON 500 instead of a bare crash —
 * never a fake success.
 */
export function withRouteErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(
        "[api] unhandled route error:",
        error instanceof Error ? error.message : error,
      );
      return apiError(
        500,
        "server_error",
        "The precinct's systems are down, detective. Try again shortly.",
      );
    }
  };
}