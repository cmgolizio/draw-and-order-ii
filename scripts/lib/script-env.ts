import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal .env loader for CLI scripts (no dotenv dependency).
 * Reads .env.local then .env; real environment variables win.
 */
export function loadScriptEnv(): void {
  for (const file of [".env.local", ".env"]) {
    let text: string;
    try {
      text = readFileSync(join(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const match = /^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = raw.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `${key} is not set — add it to .env.local (see .env.example)`,
    );
  }
  return value;
}