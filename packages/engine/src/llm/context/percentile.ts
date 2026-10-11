/** Median, as a percentile rank. */
export const P50 = 50;
/** Upper tail used for outlier thresholds. */
export const P90 = 90;
const PERCENT = 100;

/**
 * Compute the p-th percentile (0-100) of a numeric array using nearest-rank
 * interpolation. Returns 0 for an empty array.
 */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / PERCENT) * (sorted.length - 1)));
  return sorted[idx];
}
