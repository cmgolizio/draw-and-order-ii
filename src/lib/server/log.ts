import "server-only";

/**
 * Structured logging for API routes (Phase 8 observability): one JSON object
 * per line, so Vercel's log drain (and grep) can filter on `event` and
 * `route` instead of scraping prose. Never throws — logging must not take a
 * request down with it.
 */

type LogFields = Record<string, unknown>;

function emit(
  writer: (line: string) => void,
  event: string,
  fields: LogFields,
): void {
  try {
    writer(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
  } catch {
    writer(JSON.stringify({ at: new Date().toISOString(), event }));
  }
}

export function logEvent(event: string, fields: LogFields = {}): void {
  emit(console.log, event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  emit(console.warn, event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  emit(console.error, event, fields);
}

/** Normalizes unknown catch values into a loggable string. */
export function errorString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}