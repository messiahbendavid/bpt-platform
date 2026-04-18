/**
 * Port of keyDecimals() / keyStrings().
 *
 * For a given spotlight length n:
 *   keyDecimalOne  = 2^n - 1  (all-ones binary:  111...1)
 *   keyDecimalZero = 0        (all-zeros binary: 000...0)
 */
export function computeKeyDecimals(spotlight: number): {
  keyDecimalOne: number;
  keyDecimalZero: number;
} {
  return {
    keyDecimalOne:  (1 << spotlight) - 1,
    keyDecimalZero: 0,
  };
}

/**
 * Port of keyBreakoutStrings() — the one-flip-from-stasis patterns.
 * Breakout from an all-ones stasis: any pattern with exactly one 0 bit.
 * Breakout from an all-zeros stasis: any pattern with exactly one 1 bit.
 */
export function computeBreakoutKeyDecimals(spotlight: number): {
  breakoutsFromOne: number[];
  breakoutsFromZero: number[];
} {
  const breakoutsFromOne: number[] = [];
  const breakoutsFromZero: number[] = [];

  for (let i = 0; i < spotlight; i++) {
    // All-ones with bit i cleared
    breakoutsFromOne.push(((1 << spotlight) - 1) & ~(1 << i));
    // All-zeros with bit i set
    breakoutsFromZero.push(1 << i);
  }

  return { breakoutsFromOne, breakoutsFromZero };
}
