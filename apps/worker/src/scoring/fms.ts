import type { FMSComponents } from '@bpt/shared';
import { FMS_WEIGHTS } from '@bpt/shared';
import type { QuarterlyFinancials } from '@bpt/shared';
import { percentile52w } from '@bpt/shared';

function trendScore(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return 0;
  let ups = 0;
  for (let i = 1; i < valid.length; i++) {
    if (valid[i] > valid[i - 1]) ups++;
  }
  return ups / (valid.length - 1);
}

function normalizeSign(val: number | null): number {
  if (val === null) return 0;
  return val > 0 ? 1 : val < 0 ? -0.5 : 0;
}

export function computeFMS(
  quarters: QuarterlyFinancials[],
  currentPrice: number,
  low52w: number,
  high52w: number,
): FMSComponents & { total: number } {
  const netIncomeScore   = normalizeSign(quarters[0]?.netIncome ?? null);
  const cashFlowScore    = normalizeSign(quarters[0]?.ncfoa ?? null);
  const revenueTrend     = trendScore(quarters.map((q) => q.revenues));
  const pct52w           = percentile52w(currentPrice, low52w, high52w) ?? 0;

  const components: FMSComponents = {
    netIncomeScore:   Math.round(netIncomeScore * 10000) / 10000,
    cashFlowScore:    Math.round(cashFlowScore * 10000) / 10000,
    revenueTrendScore: Math.round(revenueTrend * 10000) / 10000,
    percentile52w:    Math.round(pct52w * 10000) / 10000,
  };

  const total =
    components.netIncomeScore    * FMS_WEIGHTS.netIncome +
    components.cashFlowScore     * FMS_WEIGHTS.cashFlows +
    components.revenueTrendScore * FMS_WEIGHTS.revenueTrend +
    components.percentile52w     * FMS_WEIGHTS.percentile52w;

  return { ...components, total: Math.round(total * 10000) / 10000 };
}
