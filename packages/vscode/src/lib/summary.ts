import type { AnalysisResult } from './engine';

export interface ScoreSummary {
  score: number;
  grade: string;
}

export interface AnalysisSummary {
  reportPath: string;
  analyzedFiles: number;
  technicalDebt?: ScoreSummary;
  security?: ScoreSummary & { critical: number; high: number };
  criticalGodClasses: number;
  circularDependencies: number;
  /** Scores below the requested minimums, e.g. "security 72 < 80". */
  failures: string[];
}

export interface Thresholds {
  minSecurity?: number;
  minTechnicalDebt?: number;
}

/** Condense an analysis into the numbers a CI log, JSON consumer, or VS Code summary needs. */
export function summarize(result: AnalysisResult, reportPath: string, thresholds: Thresholds = {}): AnalysisSummary {
  const analyzedFiles = result.summary.totalFiles;
  const technicalDebt = analyzedFiles > 0 && result.technicalDebt
    ? { score: result.technicalDebt.overallScore, grade: result.technicalDebt.grade }
    : undefined;
  const security = analyzedFiles > 0 && result.securityScore
    ? {
        score: result.securityScore.overallScore,
        grade: result.securityScore.grade,
        critical: result.securityScore.summary.critical,
        high: result.securityScore.summary.high,
      }
    : undefined;

  const failures: string[] = [];
  if (thresholds.minSecurity !== undefined && thresholds.minSecurity > 0 && security && security.score < thresholds.minSecurity) {
    failures.push(`security ${security.score} < ${thresholds.minSecurity}`);
  }
  if (thresholds.minTechnicalDebt !== undefined && thresholds.minTechnicalDebt > 0 && technicalDebt && technicalDebt.score < thresholds.minTechnicalDebt) {
    failures.push(`technical debt ${technicalDebt.score} < ${thresholds.minTechnicalDebt}`);
  }

  return {
    reportPath,
    analyzedFiles,
    technicalDebt,
    security,
    criticalGodClasses: (result.godClasses || []).filter((godClass) => godClass.rank === 'critical').length,
    circularDependencies: (result.circularDependencies || []).length,
    failures,
  };
}

export function formatSummary(summary: AnalysisSummary): string {
  const score = (value?: ScoreSummary) => (value ? `${value.score}/100 (${value.grade})` : 'N/A');
  const rows: Array<[string, string]> = [
    ['Report', summary.reportPath],
    ['Analyzed files', String(summary.analyzedFiles)],
    ['Technical debt', score(summary.technicalDebt)],
    ['Security', `${score(summary.security)}${summary.security ? ` — critical ${summary.security.critical}, high ${summary.security.high}` : ''}`],
    ['Critical God Classes', String(summary.criticalGodClasses)],
    ['Circular dependencies', String(summary.circularDependencies)],
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length)) + 1;
  const lines = rows.map(([label, value]) => `${(label + ':').padEnd(labelWidth + 1)}${value}`);
  if (summary.analyzedFiles === 0) lines.push('No files in a supported language were found; scores are not available.');
  for (const failure of summary.failures) lines.push(`FAILED: ${failure}`);
  return lines.join('\n');
}

module.exports = {
  summarize,
  formatSummary,
};

