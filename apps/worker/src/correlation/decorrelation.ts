import type { QuarterlyFinancials, CorrelationResult } from '@bpt/shared';
import { pearsonr } from '@bpt/shared';

/** Exact port of calculate_symbol_correlation() from app.py */
export function computeDecorrelation(
  ticker: string,
  _symbolId: string,
  quarters: QuarterlyFinancials[],
  currentPrice: number,
): CorrelationResult | null {
  // Need quarters with both revenue and a filing-date-aligned price
  const valid = quarters
    .filter((q) => q.revenues !== null && q.priceAtPeriod !== null)
    .sort((a, b) => new Date(a.periodEndDate).getTime() - new Date(b.periodEndDate).getTime());

  if (valid.length < 4) return null;

  const revenues = valid.map((q) => q.revenues as number);
  const prices   = valid.map((q) => q.priceAtPeriod as number);

  // corr_at_earnings: correlation computed with historical filing prices
  const corrAtEarnings = pearsonr(revenues, prices);
  if (!isFinite(corrAtEarnings)) return null;

  // corr_now: same but replace last price with current live price
  const pricesNow = [...prices.slice(0, -1), currentPrice];
  const corrNow   = pearsonr(revenues, pricesNow);
  if (!isFinite(corrNow)) return null;

  const corrDelta = corrNow - corrAtEarnings;

  // decorrelation_score formula from app.py:
  //   max(0, (1 - abs(corr_now)) * 0.5) + max(0, min(0.5, (-corr_delta) * 0.5))
  const decorrScore =
    Math.max(0, (1 - Math.abs(corrNow)) * 0.5) +
    Math.max(0, Math.min(0.5, (-corrDelta) * 0.5));

  // price_vs_rev_divergence: compare price change since last earnings vs latest revenue change
  const lastPrice      = prices[prices.length - 1];
  const prevRevenue    = revenues[revenues.length - 2];
  const latestRevenue  = revenues[revenues.length - 1];

  let priceVsRevDivergence: 'PRICE_AHEAD' | 'PRICE_BEHIND' | null = null;
  if (lastPrice > 0 && prevRevenue !== 0) {
    const priceChange = (currentPrice - lastPrice) / lastPrice;
    const revChange   = (latestRevenue - prevRevenue) / Math.abs(prevRevenue);

    if (priceChange > 0.10 && revChange <= 0.05) {
      priceVsRevDivergence = 'PRICE_AHEAD';
    } else if (priceChange < -0.10 && revChange >= -0.05) {
      priceVsRevDivergence = 'PRICE_BEHIND';
    }
  }

  // isDecorrelating: was positively correlated but price now moving away from revenue
  const isDecorrelating = corrAtEarnings > 0 && corrDelta < -0.05;

  return {
    ticker,
    revCorr:             round6(corrAtEarnings),
    revCorrCurrent:      round6(corrNow),
    revCorrDiff:         round6(corrDelta),
    decorrScore:         round6(decorrScore),
    priceVsRevDivergence,
    isDecorrelating,
    quartersUsed:        valid.length,
    computedAt:          new Date().toISOString(),
  };
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
