import type { Direction } from '../bitstream/Bitstream.js';

export interface CorrelationData {
  corrAtEarnings: number | null;
  corrNow: number | null;
  corrDelta: number | null;
  decorrelationScore: number | null;
  priceVsRevDivergence: 'PRICE_BEHIND' | 'PRICE_AHEAD' | null;
}

/** Port of calculate_correlation_merit_score() from app.py */
export function calculateCMS(
  corrData: CorrelationData | null,
  direction: Direction | null,
): { score: number; details: Record<string, unknown> } {
  let score = 0;
  const details: Record<string, unknown> = {
    corr_at_earnings: null,
    corr_now:         null,
    corr_delta:       null,
    decor_score:      null,
    divergence:       null,
    corr_merit:       0,
  };

  if (!corrData || corrData.corrAtEarnings === null) {
    return { score, details };
  }

  details['corr_at_earnings'] = corrData.corrAtEarnings;
  details['corr_now']         = corrData.corrNow;
  details['corr_delta']       = corrData.corrDelta;
  details['decor_score']      = corrData.decorrelationScore;
  details['divergence']       = corrData.priceVsRevDivergence;

  // Decorrelation score tiers
  const decor = corrData.decorrelationScore ?? 0;
  for (const [t, p] of [[0.7,6],[0.55,5],[0.4,4],[0.3,3],[0.2,2],[0.1,1]] as [number,number][]) {
    if (decor >= t) { score += p; break; }
  }

  // Correlation delta tiers (negative delta = good, price moving away from revenue)
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

  score = Math.max(0, score);
  details['corr_merit'] = score;
  return { score, details };
}
