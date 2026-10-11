export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface GradeThresholds {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * Convert a 0-100 score to a letter grade using the given minimum thresholds.
 * Each domain (security, technical debt, ...) defines its own thresholds
 * since they measure different things and are calibrated independently.
 */
export function scoreToGrade(score: number, thresholds: GradeThresholds): LetterGrade {
  if (score >= thresholds.a) return 'A';
  if (score >= thresholds.b) return 'B';
  if (score >= thresholds.c) return 'C';
  if (score >= thresholds.d) return 'D';
  return 'F';
}
