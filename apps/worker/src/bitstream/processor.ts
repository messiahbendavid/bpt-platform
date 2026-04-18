import type { Bit, BandBitstreamResult, BitstreamInput } from '@bpt/shared';

/**
 * Port of produceBinaryPercentileData().
 * Converts a price series into a binary sequence for one band threshold.
 * Returns one bit per price movement that crosses the band boundary.
 */
export function processBand(input: BitstreamInput): BandBitstreamResult {
  const { prices, timestamps, bpRange } = input;

  const binaryList: Bit[] = [];
  const priceList: number[] = [];
  const timeList: Date[] = [];
  const bpRangeList: number[] = [];

  if (prices.length < 2) return { binaryList, priceList, timeList, bpRangeList };

  let refPrice = prices[0];
  let upperPrice = refPrice + refPrice * bpRange;
  let lowerPrice = refPrice - refPrice * bpRange;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i];

    if (price >= upperPrice) {
      binaryList.push(1);
      priceList.push(price);
      timeList.push(timestamps[i]);
      bpRangeList.push(bpRange);
      refPrice = price;
      upperPrice = refPrice + refPrice * bpRange;
      lowerPrice = refPrice - refPrice * bpRange;
    } else if (price <= lowerPrice) {
      binaryList.push(0);
      priceList.push(price);
      timeList.push(timestamps[i]);
      bpRangeList.push(bpRange);
      refPrice = price;
      upperPrice = refPrice + refPrice * bpRange;
      lowerPrice = refPrice - refPrice * bpRange;
    }
  }

  return { binaryList, priceList, timeList, bpRangeList };
}

/**
 * Port of produceBinaryPercentileDataSS() — single-spotlight variant.
 * Only emits when the binary list reaches exactly `spotlight` length.
 */
export function processBandSpotlighted(
  input: BitstreamInput,
): BandBitstreamResult {
  const full = processBand(input);
  const { spotlight } = input;

  if (full.binaryList.length < spotlight) {
    return { binaryList: [], priceList: [], timeList: [], bpRangeList: [] };
  }

  const start = full.binaryList.length - spotlight;
  return {
    binaryList:  full.binaryList.slice(start),
    priceList:   full.priceList.slice(start),
    timeList:    full.timeList.slice(start),
    bpRangeList: full.bpRangeList.slice(start),
  };
}
