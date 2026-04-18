/** Returns (price - low) / (high - low), clamped to [0, 1]. Returns null if range is zero. */
export function percentile52w(price: number, low52w: number, high52w: number): number | null {
  const range = high52w - low52w;
  if (range <= 0) return null;
  return Math.max(0, Math.min(1, (price - low52w) / range));
}
