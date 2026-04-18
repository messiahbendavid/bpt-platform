import type { StasisDetectionResult, DecimalWindow } from '@bpt/shared';
import { computeBreakoutKeyDecimals } from './keys.js';

/**
 * Port of produceDecimalBreakoutCounts().
 * Given a sequence of DecimalWindows for one (symbol, band, spotlight),
 * counts breakouts and reversions to determine win probability.
 */
export function countBreakoutsAndReversions(
  windows: DecimalWindow[],
  spotlight: number,
): { breakoutCount: number; reversionCount: number; winProbability: number | null } {
  const { breakoutsFromOne, breakoutsFromZero } = computeBreakoutKeyDecimals(spotlight);
  const breakoutSetOne = new Set(breakoutsFromOne);
  const breakoutSetZero = new Set(breakoutsFromZero);

  let breakoutCount = 0;
  let reversionCount = 0;
  let prevStasisDirection: 0 | 1 | null = null;

  for (const win of windows) {
    if (win.isStasis) {
      prevStasisDirection = win.stasisDirection;
      continue;
    }

    if (prevStasisDirection === 1 && breakoutSetOne.has(win.decimalValue)) {
      breakoutCount++;
      prevStasisDirection = null;
    } else if (prevStasisDirection === 0 && breakoutSetZero.has(win.decimalValue)) {
      breakoutCount++;
      prevStasisDirection = null;
    } else if (prevStasisDirection !== null) {
      reversionCount++;
      prevStasisDirection = null;
    }
  }

  const total = breakoutCount + reversionCount;
  const winProbability = total > 0 ? breakoutCount / total : null;

  return { breakoutCount, reversionCount, winProbability };
}

/**
 * Determines active stasis state from the most recent DecimalWindow.
 */
export function detectStasis(
  window: DecimalWindow,
  priorStasisCount: number,
  entryPrice: number | null,
  peakPrice: number | null,
  troughPrice: number | null,
  breakoutCount: number,
  reversionCount: number,
  winProbability: number | null,
  stasisStartedAt: Date | null,
): StasisDetectionResult {
  if (!window.isStasis) {
    return {
      isStasis: false,
      direction: null,
      stasisCount: 0,
      entryPrice: null,
      peakPrice: null,
      troughPrice: null,
      breakoutCount,
      reversionCount,
      winProbability,
      stasisStartedAt: null,
    };
  }

  const price = window.signalPrice;
  const newEntry  = entryPrice  ?? price;
  const newPeak   = peakPrice   !== null ? Math.max(peakPrice, price) : price;
  const newTrough = troughPrice !== null ? Math.min(troughPrice, price) : price;

  return {
    isStasis: true,
    direction: window.stasisDirection,
    stasisCount: priorStasisCount + 1,
    entryPrice: newEntry,
    peakPrice: newPeak,
    troughPrice: newTrough,
    breakoutCount,
    reversionCount,
    winProbability,
    stasisStartedAt: stasisStartedAt ?? window.signalAt,
  };
}
