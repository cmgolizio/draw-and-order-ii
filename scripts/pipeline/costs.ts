/**
 * Per-suspect cost tracking (Phase 2 acceptance: costs logged per suspect).
 *
 * Claude usage is priced from the table below; image generation uses flat
 * per-image estimates per provider. Totals are printed per suspect and per
 * batch, stored in model_info.cost, and appended to pipeline-costs.jsonl
 * (gitignored) for a durable local record.
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";

/** USD per million tokens (input, output). Cached 2026-06. */
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/** Flat USD-per-image estimates; tune as providers reprice. */
const IMAGE_PRICING: Record<string, number> = {
  openai: 0.04,
  fal: 0.025,
  mock: 0,
};

export type CostEntry = {
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
};

export class CostTracker {
  private entries: CostEntry[] = [];

  addClaude(
    label: string,
    model: string,
    usage: { input_tokens: number; output_tokens: number },
  ) {
    const price = CLAUDE_PRICING[model] ?? { input: 5, output: 25 };
    const usd =
      (usage.input_tokens / 1e6) * price.input +
      (usage.output_tokens / 1e6) * price.output;
    this.entries.push({
      label,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      usd,
    });
  }

  addImage(label: string, provider: string, count = 1) {
    this.entries.push({
      label,
      model: `image:${provider}`,
      inputTokens: 0,
      outputTokens: 0,
      usd: (IMAGE_PRICING[provider] ?? 0.04) * count,
    });
  }

  get totalUsd(): number {
    return this.entries.reduce((sum, e) => sum + e.usd, 0);
  }

  summary() {
    return {
      total_usd: round4(this.totalUsd),
      entries: this.entries.map((e) => ({ ...e, usd: round4(e.usd) })),
    };
  }

  print(prefix: string) {
    for (const e of this.entries) {
      const tokens =
        e.inputTokens || e.outputTokens
          ? ` (${e.inputTokens} in / ${e.outputTokens} out)`
          : "";
      console.log(
        `${prefix}  ${e.label} [${e.model}]${tokens}: $${e.usd.toFixed(4)}`,
      );
    }
    console.log(`${prefix}  total: $${this.totalUsd.toFixed(4)}`);
  }
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Append a JSONL record so batch costs survive the terminal scrollback. */
export function logCostRecord(record: object) {
  try {
    appendFileSync(
      join(process.cwd(), "pipeline-costs.jsonl"),
      JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n",
    );
  } catch {
    // Cost logging must never kill a batch.
  }
}