import type { CMSComponents } from '@bpt/shared';
import { CMS_WEIGHTS } from '@bpt/shared';
import type { CorrelationResult } from '@bpt/shared';

export function computeCMS(
  current: CorrelationResult,
  prior: CorrelationResult | null,
): CMSComponents & { total: number } {
  const decorrelationMagnitude = Math.abs(current.diffSum);

  const deltaRate = prior !== null
    ? Math.abs(current.diffSum) - Math.abs(prior.diffSum)
    : 0;

  let directionAlignment: -1 | 0 | 1 = 0;
  if (current.revCorrDiff < 0 && current.depsCorrDiff < 0) {
    directionAlignment = 1;
  } else if (current.revCorrDiff > 0 || current.depsCorrDiff > 0) {
    directionAlignment = -1;
  }

  const components: CMSComponents = {
    decorrelationMagnitude: Math.round(decorrelationMagnitude * 1_000_000) / 1_000_000,
    deltaRate:              Math.round(deltaRate * 1_000_000) / 1_000_000,
    directionAlignment,
  };

  const total =
    components.decorrelationMagnitude * CMS_WEIGHTS.decorrelationMagnitude +
    Math.max(0, components.deltaRate) * CMS_WEIGHTS.deltaRate +
    Math.max(0, components.directionAlignment) * CMS_WEIGHTS.directionAlignment;

  return { ...components, total: Math.round(total * 10000) / 10000 };
}
