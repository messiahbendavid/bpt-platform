import type { Bit, BandBitstreamResult, DecimalWindow, BitstreamInput } from '@bpt/shared';
import { processBandSpotlighted } from './processor.js';
import { computeKeyDecimals } from './keys.js';

/** Port of getDecimalFromBinaryList() */
export function bitsToDecimal(bits: Bit[]): number {
  return parseInt(bits.join(''), 2);
}

/**
 * Port of produceDecimalSpotlightDataSS().
 * Runs the spotlighted band processor and builds a DecimalWindow.
 */
export function computeDecimalWindowSS(input: BitstreamInput): DecimalWindow | null {
  const result: BandBitstreamResult = processBandSpotlighted(input);
  if (result.binaryList.length === 0) return null;

  const { binaryList, priceList, timeList } = result;
  const decimalValue = bitsToDecimal(binaryList);
  const binarySequence = binaryList.join('');
  const { keyDecimalOne, keyDecimalZero } = computeKeyDecimals(input.spotlight);

  const isStasis = decimalValue === keyDecimalOne || decimalValue === keyDecimalZero;
  const stasisDirection: 0 | 1 | null = isStasis
    ? decimalValue === keyDecimalOne ? 1 : 0
    : null;

  return {
    decimalValue,
    binarySequence,
    keyDecimalOne,
    keyDecimalZero,
    isStasis,
    stasisDirection,
    signalPrice: priceList[priceList.length - 1],
    signalAt: timeList[timeList.length - 1],
  };
}
