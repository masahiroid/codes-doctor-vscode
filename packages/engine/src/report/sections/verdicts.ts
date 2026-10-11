import type { AnalysisResult } from '../../types';

/** One-line verdict for a technical debt grade. */
const DEBT_HEADLINES: Record<string, string> = {
  A: '構造はおおむね健全です',
  B: '概ね良好ですが改善点があります',
  C: '改善が必要な箇所があります',
  D: '構造の問題が目立ちます',
  F: '早めの改善が必要です',
};

export function debtHeadline(grade: string): string {
  return DEBT_HEADLINES[grade] ?? '';
}

/** Findings in production code and in tests; only the former count toward the score. */
export function securityFindingCounts(result: AnalysisResult): { production: number; test: number } {
  const issues = result.securityScore?.issues ?? [];
  const test = issues.filter((issue) => issue.inTest).length;
  return { production: issues.length - test, test };
}

export function securityHeadline(productionFindings: number): string {
  return productionFindings > 0 ? `本番コードの指摘は ${productionFindings} 件` : '本番コードに指摘はありません';
}
