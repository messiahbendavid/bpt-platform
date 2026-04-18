import type { Direction } from '../bitstream/Bitstream.js';

export interface CorrelationData {
  corrAtEarnings: number | null;
  corrNow: number | null;
  corrDelta: number | null;
  decorrelationScore: number | null;
  priceVsRevDivergence: 'PRICE_BEHIND' | 'PRICE_AHEAD' | 'ALIGNED' | null;
}

/** Port of calculate_correlation_merit_score() from app.py */
export function calculateCMS(
  corrData: CorrelationData | null,
  direction: Direction | null,
): { score: number } {
  let score = 0;

  if (!corrData || corrData.corrAtEarnings === null) {
    return { score };
  }

  // Decorrelation score tiers (0–1 range from the formula)
  const decor = corrData.decorrelationScore ?? 0;
  for (const [t, p] of [[0.7,6],[0.55,5],[0.4,4],[0.3,3],[0.2,2],[0.1,1]] as [number,number][]) {
    if (decor >= t) { score += p; break; }
  }

  // Correlation delta tiers (negative delta = good, price diverging from revenue)
  const delta = corrData.corrDelta;
  if (delta !== null) {
    for (const [t, p] of [[-0.4,4],[-0.25,3],[-0.15,2],[-0.05,1]] as [number,number][]) {
      if (delta <= t) { score += p; break; }
    }
  }

  // Divergence alignment with trade direction
  const div = corrData.priceVsRevDivergence;
  if (div && direction) {
    if      (div === 'PRICE_BEHIND' && direction === 'LONG')  score += 3;
    else if (div === 'PRICE_AHEAD'  && direction === 'SHORT') score += 3;
    else if (div === 'PRICE_AHEAD'  && direction === 'LONG')  score -= 1;
    else if (div === 'PRICE_BEHIND' && direction === 'SHORT') score -= 1;
  }

  return { score: Math.max(0, score) };
}
