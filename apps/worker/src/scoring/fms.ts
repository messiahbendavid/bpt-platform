import type { QuarterlyFinancials } from '@bpt/shared';

interface FundamentalSlopes {
  Rev_Slope_5?: number;
  FCF_Slope_5?: number;
  'Return on Equity_Slope_5'?: number;
  'Net Profit Margin_Slope_5'?: number;
  'P/E Ratio_Slope_5'?: number;
  'Debt to Equity Ratio_Slope_5'?: number;
  FCFY?: number;
}

function last5AllPositive(series: (number | null)[]): boolean {
  if (series.length < 5) return false;
  const last5 = series.slice(-5);
  return last5.every((x) => x !== null && x > 0);
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
  slopes: FundamentalSlopes = {},
): { score: number; details: Record<string, unknown> } {
  let ms = 0;
  const sd: Record<string, unknown> = {};

  const ni  = quarters.map((q) => q.netIncome);
  const ocf = quarters.map((q) => q.ncfoa);
  const fcf = quarters.map((q) => q.fcf);
  const rev = quarters.map((q) => q.revenues);

  // Net income
  sd['NI_5_Positive'] = last5AllPositive(ni);
  if (sd['NI_5_Positive']) ms += 4;
  sd['NI_Latest_Highest_5Q'] = last5LatestIsHighest(ni);
  if (sd['NI_Latest_Highest_5Q']) ms += 3;

  // Operating cash flow
  sd['OCF_5_Positive'] = last5AllPositive(ocf);
  if (sd['OCF_5_Positive']) ms += 4;
  sd['OCF_Latest_Highest_5Q'] = last5LatestIsHighest(ocf);
  if (sd['OCF_Latest_Highest_5Q']) ms += 3;

  // Free cash flow
  sd['FCF_5_Positive'] = last5AllPositive(fcf);
  if (sd['FCF_5_Positive']) ms += 4;
  sd['FCF_Latest_Highest_5Q'] = last5LatestIsHighest(fcf);
  if (sd['FCF_Latest_Highest_5Q']) ms += 3;

  // Revenue
  sd['REV_5_Positive'] = last5AllPositive(rev);
  if (sd['REV_5_Positive']) ms += 2;
  sd['REV_Latest_Highest_5Q'] = last5LatestIsHighest(rev);
  if (sd['REV_Latest_Highest_5Q']) ms += 3;

  // 52-week percentile (lower = better, buying near lows)
  if (w52Pct !== null) {
    for (const [t, p] of [[5,8],[15,7],[25,6],[35,5],[45,4],[55,3],[65,2],[75,1]] as [number,number][]) {
      if (w52Pct <= t) { ms += p; break; }
    }
  }

  if (!slopes || Object.keys(slopes).length === 0) {
    return { score: ms, details: sd };
  }

  // Positive slope bonuses
  for (const [lbl, key, tps] of [
    ['Rev_5',  'Rev_Slope_5',                   [[0.30,4],[0.20,3],[0.10,2],[0.05,1]]],
    ['FCF_5',  'FCF_Slope_5',                   [[0.40,4],[0.25,3],[0.10,2],[0.05,1]]],
    ['ROE_5',  'Return on Equity_Slope_5',       [[0.20,2],[0.10,1]]],
    ['NPM_5',  'Net Profit Margin_Slope_5',      [[0.20,2],[0.10,1]]],
  ] as [string, keyof FundamentalSlopes, [number,number][]][]) {
    const v = slopes[key] ?? null;
    sd[lbl] = v;
    if (v !== null) {
      for (const [t, p] of tps) {
        if (v >= t) { ms += p; break; }
      }
    }
  }

  // Negative slope bonuses (lower is better)
  for (const [lbl, key, tps] of [
    ['PE_5', 'P/E Ratio_Slope_5',           [[-0.25,3],[-0.15,2],[-0.05,1]]],
    ['DE_5', 'Debt to Equity Ratio_Slope_5', [[-0.20,2],[-0.10,1]]],
  ] as [string, keyof FundamentalSlopes, [number,number][]][]) {
    const v = slopes[key] ?? null;
    sd[lbl] = v;
    if (v !== null) {
      for (const [t, p] of tps) {
        if (v <= t) { ms += p; break; }
      }
    }
  }

  // Free cash flow yield
  const fcfy = slopes.FCFY ?? null;
  sd['FCFY'] = fcfy;
  if (fcfy !== null) {
    if (fcfy >= 0.15)      ms += 3;
    else if (fcfy >= 0.10) ms += 2;
    else if (fcfy >= 0.05) ms += 1;
  }

  return { score: ms, details: sd };
}
