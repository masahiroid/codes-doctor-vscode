import type { AnalysisResult } from '../vendor/csap-en';
import { SEVERITIES, type Severity } from './options';

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
  /** Source-code and dependency findings added together. */
  findings: Record<Severity, number>;
  /** False when the dependency scan could not finish, so its zero counts prove nothing. */
  dependencyScanComplete: boolean;
  /** Checks that did not pass, e.g. "security 72 < 80". */
  failures: string[];
}

export interface Thresholds {
  minSecurity?: number;
  minTechnicalDebt?: number;
  failOn?: Severity;
  allowIncompleteScan?: boolean;
}

/** Condense an analysis into the numbers a CI log or JSON consumer needs. */
export function summarize(result: AnalysisResult, reportPath: string, thresholds: Thresholds): AnalysisSummary {
  const analyzedFiles = result.summary.totalFiles;
  // With nothing analyzed the scores are meaningless, so they are omitted and never fail.
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
  if (thresholds.minSecurity !== undefined && security && security.score < thresholds.minSecurity) {
    failures.push(`security ${security.score} < ${thresholds.minSecurity}`);
  }
  if (thresholds.minTechnicalDebt !== undefined && technicalDebt && technicalDebt.score < thresholds.minTechnicalDebt) {
    failures.push(`technical debt ${technicalDebt.score} < ${thresholds.minTechnicalDebt}`);
  }

  const code = analyzedFiles > 0 ? result.securityScore?.summary : undefined;
  const dependencies = result.vulnerabilityScan;
  const findings: Record<Severity, number> = {
    low: (code?.low ?? 0) + (dependencies?.low ?? 0),
    medium: (code?.medium ?? 0) + (dependencies?.moderate ?? 0),
    high: (code?.high ?? 0) + (dependencies?.high ?? 0),
    critical: (code?.critical ?? 0) + (dependencies?.critical ?? 0),
  };
  const dependencyScanComplete = Boolean(dependencies) && !dependencies?.incomplete;
  if (thresholds.failOn) {
    const counted = SEVERITIES.slice(SEVERITIES.indexOf(thresholds.failOn)).filter((severity) => findings[severity] > 0);
    if (counted.length > 0) {
      failures.push(`findings at ${thresholds.failOn} or worse: ${counted.map((severity) => `${severity} ${findings[severity]}`).join(', ')}`);
    }
    if (!dependencyScanComplete && !thresholds.allowIncompleteScan) {
      failures.push(`dependency scan did not finish: ${dependencies?.summary ?? 'no result'}`);
    }
  }

  return {
    reportPath,
    analyzedFiles,
    technicalDebt,
    security,
    criticalGodClasses: result.godClasses.filter((godClass) => godClass.rank === 'critical').length,
    circularDependencies: result.circularDependencies.length,
    findings,
    dependencyScanComplete,
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
