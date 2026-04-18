import type { MetricSlopes } from '@bpt/shared';

interface MetricDef {
  key: string;
  tier: 1 | 2 | 3;
  invert: boolean;
}

// 20 fundamental metrics across 3 tiers
const METRICS: MetricDef[] = [
  // Tier 1 — Core growth & cash generation (weight 3)
  { key: 'rev',     tier: 1, invert: false },
  { key: 'ni',      tier: 1, invert: false },
  { key: 'ocf',     tier: 1, invert: false },
  { key: 'fcf',     tier: 1, invert: false },
  { key: 'fcfy',    tier: 1, invert: false },
  // Tier 2 — Quality & efficiency (weight 2)
  { key: 'oi',      tier: 2, invert: false },
  { key: 'gp',      tier: 2, invert: false },
  { key: 'npm',     tier: 2, invert: false },
  { key: 'roe',     tier: 2, invert: false },
  { key: 'gm',      tier: 2, invert: false },
  { key: 'om',      tier: 2, invert: false },
  { key: 'buyback', tier: 2, invert: false },
  { key: 'cash',    tier: 2, invert: false },
  // Tier 3 — Valuation & balance sheet structure (weight 1)
  { key: 'pe',      tier: 3, invert: true  },  // declining P/E = good
  { key: 'de',      tier: 3, invert: true  },  // declining debt/equity = good
  { key: 'pb',      tier: 3, invert: true  },  // declining price/book = cheaper
  { key: 'ps',      tier: 3, invert: true  },  // declining price/sales = cheaper
  { key: 'assets',  tier: 3, invert: false },
  { key: 'equity',  tier: 3, invert: false },
  { key: 'liab',    tier: 3, invert: true  },  // growing liabilities = bad
];

const TIER_WEIGHT: Record<number, number> = { 1: 3, 2: 2, 3: 1 };
const SHORT_WEIGHT = 1.1;  // short (5q) slopes weighted slightly more
const LONG_WEIGHT  = 1.0;
const FMS_SCALE    = 8;    // weighted-avg(0-1) × 52W-mult(1-2.5) × 8 → 0-20

// Returns the fraction of values strictly below `value` in the sorted universe.
// Requires at least 2 peers to produce a meaningful rank.
function percentileRank(value: number, universe: number[]): number {
  if (universe.length < 2) return 0.5;
  const below = universe.filter((v) => v < value).length;
  return below / universe.length;
}

/**
 * Cross-sectional FMS computation.
 * All tickers are ranked relative to each other per metric×timeframe,
 * then weighted and multiplied by their 52W price position.
 */
export function computeFMSCrossSectional(
  allSlopes: Map<string, MetricSlopes>,
  all52wPct: Map<string, number | null>,
): Map<string, number> {
  const tickers = [...allSlopes.keys()];

  // Pre-build sorted value arrays per (metric, timeframe) for ranking
  const shortUniverse = new Map<string, number[]>();
  const longUniverse  = new Map<string, number[]>();

  for (const m of METRICS) {
    const sv: number[] = [];
    const lv: number[] = [];
    for (const t of tickers) {
      const s = allSlopes.get(t)!;
      const sVal = s[`${m.key}_short`];
      const lVal = s[`${m.key}_long`];
      if (sVal !== null && isFinite(sVal)) sv.push(m.invert ? -sVal : sVal);
      if (lVal !== null && isFinite(lVal)) lv.push(m.invert ? -lVal : lVal);
    }
    shortUniverse.set(m.key, sv);
    longUniverse.set(m.key, lv);
  }

  const result = new Map<string, number>();

  for (const ticker of tickers) {
    const slopes = allSlopes.get(ticker)!;
    const w52Pct = all52wPct.get(ticker) ?? null;
    const w52Mult = w52Pct !== null
      ? 1.0 + 1.5 * (1 - w52Pct / 100)
      : 1.25;  // missing 52W data → mid-range multiplier

    let weightedSum = 0;
    let totalWeight = 0;

    for (const m of METRICS) {
      const tierW = TIER_WEIGHT[m.tier];
      const sArr  = shortUniverse.get(m.key)!;
      const lArr  = longUniverse.get(m.key)!;

      const sRaw = slopes[`${m.key}_short`];
      const lRaw = slopes[`${m.key}_long`];

      if (sRaw !== null && isFinite(sRaw) && sArr.length >= 2) {
        const rank = percentileRank(m.invert ? -sRaw : sRaw, sArr);
        weightedSum += rank * tierW * SHORT_WEIGHT;
        totalWeight += tierW * SHORT_WEIGHT;
      }
      if (lRaw !== null && isFinite(lRaw) && lArr.length >= 2) {
        const rank = percentileRank(m.invert ? -lRaw : lRaw, lArr);
        weightedSum += rank * tierW * LONG_WEIGHT;
        totalWeight += tierW * LONG_WEIGHT;
      }
    }

    const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    result.set(ticker, Math.round(rawScore * w52Mult * FMS_SCALE * 10) / 10);
  }

  return result;
}
