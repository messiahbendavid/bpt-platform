import type { QuarterlyFinancials, CorrelationResult } from '@bpt/shared';
import { pearsonr } from '@bpt/shared';

export function computeDecorrelation(
  ticker: string,
  symbolId: string,
  quarters: QuarterlyFinancials[],
  currentPrice: number,
): CorrelationResult | null {
  const valid = quarters.filter(
    (q) => q.revenues !== null && q.priceAtPeriod !== null,
  );

  if (valid.length < 4) return null;

  const revenues = valid.map((q) => q.revenues as number);
  const prices   = valid.map((q) => q.priceAtPeriod as number);
  const deps     = valid.map((q) => (q.netIncome ?? 0) + (q.ncfoa ?? 0));

  const revCorr  = pearsonr(revenues, prices);
  const depsCorr = pearsonr(deps, prices);

  if (isNaN(revCorr) || isNaN(depsCorr)) return null;

  const pricesCurrent = [...prices.slice(0, -1), currentPrice];
  const revCorrCurrent  = pearsonr(revenues, pricesCurrent);
  const depsCorrCurrent = pearsonr(deps, pricesCurrent);

  const revCorrDiff  = revCorrCurrent  - revCorr;
  const depsCorrDiff = depsCorrCurrent - depsCorr;
  const diffSum      = revCorrDiff + depsCorrDiff;

  const isDecorrelating =
    revCorr > 0 && revCorrDiff < 0 &&
    depsCorr > 0 && depsCorrDiff < 0;

  return {
    ticker,
    revCorr:          Math.round(revCorr * 1_000_000) / 1_000_000,
    revCorrCurrent:   Math.round(revCorrCurrent * 1_000_000) / 1_000_000,
    revCorrDiff:      Math.round(revCorrDiff * 1_000_000) / 1_000_000,
    depsCorr:         Math.round(depsCorr * 1_000_000) / 1_000_000,
    depsCorrCurrent:  Math.round(depsCorrCurrent * 1_000_000) / 1_000_000,
    depsCorrDiff:     Math.round(depsCorrDiff * 1_000_000) / 1_000_000,
    diffSum:          Math.round(diffSum * 1_000_000) / 1_000_000,
    isDecorrelating,
    quartersUsed:     valid.length,
    computedAt:       new Date().toISOString(),
  };
}
