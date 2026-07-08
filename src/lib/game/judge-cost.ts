/**
 * Judge cost estimation (Phase 8 observability): USD per judge call, computed
 * from the model's token pricing and logged with every scoring event so spend
 * per round is visible in the logs without a billing export.
 *
 * Pure module — no env, no IO — so Vitest and the calibration script can use
 * it directly. Prices are USD per million tokens, cached 2026-06; the
 * fallback assumes the priciest tier so an unknown model over-counts rather
 * than under-counts.
 */

type TokenPrice = { input: number; output: number };

export const JUDGE_TOKEN_PRICING: Record<string, TokenPrice> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const FALLBACK_PRICE: TokenPrice = { input: 5, output: 25 };

export function estimateJudgeCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): number {
  const price = JUDGE_TOKEN_PRICING[model] ?? FALLBACK_PRICE;
  const usd =
    (usage.input_tokens / 1e6) * price.input +
    (usage.output_tokens / 1e6) * price.output;
  return Math.round(usd * 10_000) / 10_000;
}