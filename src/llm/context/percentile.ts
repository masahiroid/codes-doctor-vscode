/**
 * Compute the p-th percentile (0-100) of a numeric array using nearest-rank
 * interpolation. Returns 0 for an empty array.
 */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * (sorted.length - 1)));
  return sorted[idx];
}
