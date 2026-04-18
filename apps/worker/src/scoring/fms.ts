import type { QuarterlyFinancials, FundamentalSlopes } from '@bpt/shared';

function last5AllPositive(series: (number | null)[]): boolean {
  if (series.length < 5) return false;
  return series.slice(-5).every((x) => x !== null && x > 0);
}

function last5LatestIsHighest(series: (number | null)[]): boolean {
  if (series.length < 5) return false;
  const last5 = series.slice(-5);
  if (last5.some((x) => x === null)) return false;
  const vals = last5 as number[];
  return vals[vals.length - 1] === Math.max(...vals);
}

/** Port of calculate_fundamental_merit_score() from app.py */
export function calculateFMS(
  quarters: QuarterlyFinancials[],
  w52Pct: number | null,
  slopes: Partial<FundamentalSlopes> = {},
): { score: number } {
  let ms = 0;

  const ni  = quarters.map((q) => q.netIncome);
  const ocf = quarters.map((q) => q.ncfoa);
  const fcf = quarters.map((q) => q.fcf);
  const rev = quarters.map((q) => q.revenues);

  if (last5AllPositive(ni))          ms += 4;
  if (last5LatestIsHighest(ni))      ms += 3;
  if (last5AllPositive(ocf))         ms += 4;
  if (last5LatestIsHighest(ocf))     ms += 3;
  if (last5AllPositive(fcf))         ms += 4;
  if (last5LatestIsHighest(fcf))     ms += 3;
  if (last5AllPositive(rev))         ms += 2;
  if (last5LatestIsHighest(rev))     ms += 3;

  // 52-week percentile (lower = better, buying near lows)
  if (w52Pct !== null) {
    for (const [t, p] of [[5,8],[15,7],[25,6],[35,5],[45,4],[55,3],[65,2],[75,1]] as [number,number][]) {
      if (w52Pct <= t) { ms += p; break; }
    }
  }

  // Positive-slope bonuses
  const posSlopes: [keyof FundamentalSlopes, [number, number][]][] = [
    ['Rev_Slope_5',                 [[0.30,4],[0.20,3],[0.10,2],[0.05,1]]],
    ['FCF_Slope_5',                 [[0.40,4],[0.25,3],[0.10,2],[0.05,1]]],
    ['Return on Equity_Slope_5',    [[0.20,2],[0.10,1]]],
    ['Net Profit Margin_Slope_5',   [[0.20,2],[0.10,1]]],
  ];
  for (const [k, tps] of posSlopes) {
    const v = slopes[k] ?? null;
    if (v !== null) {
      for (const [t, p] of tps) { if (v >= t) { ms += p; break; } }
    }
  }

  // Negative-slope bonuses (lower is better)
  const negSlopes: [keyof FundamentalSlopes, [number, number][]][] = [
    ['P/E Ratio_Slope_5',            [[-0.25,3],[-0.15,2],[-0.05,1]]],
    ['Debt to Equity Ratio_Slope_5', [[-0.20,2],[-0.10,1]]],
  ];
  for (const [k, tps] of negSlopes) {
    const v = slopes[k] ?? null;
    if (v !== null) {
      for (const [t, p] of tps) { if (v <= t) { ms += p; break; } }
    }
  }

  // Free cash flow yield
  const fcfy = slopes.FCFY ?? null;
  if (fcfy !== null) {
    if (fcfy >= 0.15)      ms += 3;
    else if (fcfy >= 0.10) ms += 2;
    else if (fcfy >= 0.05) ms += 1;
  }

  return { score: ms };
}
