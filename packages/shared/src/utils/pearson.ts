/**
 * Pearson correlation coefficient — port of scipy.stats.pearsonr.
 * Returns NaN if std dev of either array is zero or arrays are < 2 elements.
 */
export function pearsonr(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2 || n !== y.length) return NaN;

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) { sumX += x[i]; sumY += y[i]; }
  const mx = sumX / n;
  const my = sumY / n;

  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num  += dx * dy;
    dx2  += dx * dx;
    dy2  += dy * dy;
  }

  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return NaN;
  return Math.max(-1, Math.min(1, num / denom));
}
