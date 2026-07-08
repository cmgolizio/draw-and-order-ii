import "server-only";
import { errorString, logError, logEvent } from "@/lib/server/log";

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
 * Wraps a game route with the Phase 8 observability contract: every request
 * emits one structured `api_request` log (route, method, status, duration),
 * and anything unhandled (missing env, a Supabase outage) becomes an honest
 * JSON 500 instead of a bare crash — never a fake success.
 */
export function withRouteErrors<Req extends Request, Args extends unknown[]>(
  route: string,
  handler: (request: Req, ...rest: Args) => Promise<Response>,
): (request: Req, ...rest: Args) => Promise<Response> {
  return async (request, ...rest) => {
    const started = Date.now();
    try {
      const response = await handler(request, ...rest);
      logEvent("api_request", {
        route,
        method: request.method,
        status: response.status,
        ms: Date.now() - started,
      });
      return response;
    } catch (error) {
      logError("api_error", {
        route,
        method: request.method,
        ms: Date.now() - started,
        error: errorString(error),
      });
      return apiError(
        500,
        "server_error",
        "The precinct's systems are down, detective. Try again shortly.",
      );
    }
  };
}