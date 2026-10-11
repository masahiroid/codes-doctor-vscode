import path from 'node:path';
import type { AnalysisResult, SecurityIssue } from '../../types';
import { ISSUE_SEVERITY_SCORE_THRESHOLDS, CYCLE_LENGTH_THRESHOLDS } from '../../analyzer/technicalDebt';
import { escapeHtml } from '../../html';
import { debtHeadline, securityFindingCounts, securityHeadline } from './verdicts';
import { badge, bulletList, countCard, gradeTone, meter, notice, panel, scoreCard, scoreTone, section, severityTone, stat, table } from '../ui';

const SECURITY_ISSUE_TABLE_ROW_LIMIT = 40;

/** Marks findings in test code, which are listed but do not count toward the score. */
const TEST_CODE_BADGE = badge('テストコード', 'lavender', { title: 'スコアには含めません' });

interface MetricRow {
  label: string;
  score: number;
  detail: { includedInOverall?: boolean; explanation?: string; problems?: string[]; goodPoints?: string[] } | undefined;
}

function issueBreakdown(result: AnalysisResult): string {
  const technicalDebt = result.technicalDebt!;
  const { critical: criticalScoreMax, high: highScoreMax } = ISSUE_SEVERITY_SCORE_THRESHOLDS;
  const { critical: criticalCycleLen, highMax: highCycleLenMax, medium: mediumCycleLen } = CYCLE_LENGTH_THRESHOLDS;
  const { codeComplexity, maintainability, circularDeps } = technicalDebt.metrics;
  const criticalGodClasses = result.godClasses.filter((godClass) => godClass.rank === 'critical').length;
  const highGodClasses = result.godClasses.filter((godClass) => godClass.rank === 'high').length;
  const criticalCycles = result.circularDependencies.filter((dependency) => dependency.length > criticalCycleLen).length;
  const highCycles = result.circularDependencies.filter((dependency) => dependency.length > mediumCycleLen && dependency.length <= highCycleLenMax).length;
  const isCritical = (score: number) => score < criticalScoreMax;
  const isHigh = (score: number) => score >= criticalScoreMax && score < highScoreMax;
  const criticalMetrics = [codeComplexity, maintainability].filter(isCritical).length;
  const highMetrics = [codeComplexity, maintainability].filter(isHigh).length + (circularDeps < highScoreMax ? 1 : 0);
  const line = (label: string, critical: number, high: number) => {
    const criticalBadge = badge('Critical ' + critical, critical ? 'rose' : 'mint');
    const highBadge = badge('High ' + high, high ? 'peach' : 'mint');
    return `<tr><td>${label}</td><td class="num">${criticalBadge}</td><td class="num">${highBadge}</td></tr>`;
  };
  return `<div class="stats">
      ${stat('Critical', technicalDebt.issues.critical, { tone: 'rose' })}
      ${stat('High', technicalDebt.issues.high, { tone: 'peach' })}
      ${stat('Medium', technicalDebt.issues.medium, { tone: 'butter' })}
      ${stat('Low', technicalDebt.issues.low, { tone: 'sky' })}
    </div>
    <h4 class="gap-top">検出課題 (Critical/High) の内訳</h4>
    <div class="table-wrap"><table><tbody>
      ${line('God Class', criticalGodClasses, highGodClasses)}
      ${line('循環依存', criticalCycles, highCycles)}
      ${line('メトリクス閾値', criticalMetrics, highMetrics)}
    </tbody></table></div>`;
}

function renderMetricCard(metric: MetricRow): string {
  const excluded = metric.detail?.includedInOverall === false ? ` ${badge('総合点対象外', 'lavender')}` : '';
  const problems = metric.detail?.problems?.length
    ? notice('rose', '問題点:', bulletList(metric.detail.problems))
    : '';
  const goodPoints = metric.detail?.goodPoints?.length
    ? notice('mint', '良好な点:', bulletList(metric.detail.goodPoints))
    : '';
  return panel(`
    <div class="panel-head">
      <h3>${metric.label}${excluded}</h3>${meter(metric.score, scoreTone(metric.score))}
    </div>
    ${metric.detail?.explanation ? `<p class="muted gap-bottom">${metric.detail.explanation}</p>` : ''}
    ${problems}${goodPoints}`);
}

export function technicalDebtSection(result: AnalysisResult): string {
  if (!result.technicalDebt) return '';
  const technicalDebt = result.technicalDebt;
  const metricList: MetricRow[] = [
    { label: 'コード複雑度', score: technicalDebt.metrics.codeComplexity, detail: technicalDebt.metricsDetail?.codeComplexity },
    { label: '保守性', score: technicalDebt.metrics.maintainability, detail: technicalDebt.metricsDetail?.maintainability },
    { label: '循環依存', score: technicalDebt.metrics.circularDeps, detail: technicalDebt.metricsDetail?.circularDeps },
  ];
  const recommendations = technicalDebt.recommendations?.length
    ? notice('sky', '推奨事項', bulletList(technicalDebt.recommendations))
    : '';

  return section('技術負債スコア', `
    <div class="grid grid-2">
      ${scoreCard({ label: '技術負債スコア', score: technicalDebt.overallScore, grade: technicalDebt.grade, headline: debtHeadline(technicalDebt.grade), note: technicalDebt.summary, tone: 'lavender' })}
      ${panel(issueBreakdown(result))}
    </div>
    <div class="grid grid-3">${metricList.map(renderMetricCard).join('')}</div>
    ${recommendations}
    <p class="muted">未実装のメトリクスは表示のみ行い、総合点には含めていません。</p>`);
}

function renderSecurityIssueRow(issue: SecurityIssue): string {
  const line = issue.lineNumber ? ':' + issue.lineNumber : '';
  const location = escapeHtml(path.basename(issue.filePath)) + line;
  return `<tr>
    <td>${badge(issue.type, severityTone(issue.type), { upper: true })}</td>
    <td class="cell-main">${issue.category}${issue.inTest ? ` ${TEST_CODE_BADGE}` : ''}</td>
    <td>${issue.description}</td>
    <td><code>${location}</code></td>
    <td class="muted">${issue.recommendation}</td>
  </tr>`;
}

export function securitySection(result: AnalysisResult): string {
  if (!result.securityScore) return '';
  const securityScoreData = result.securityScore;
  const { summary } = securityScoreData;
  const { production: productionFindings, test: testFindings } = securityFindingCounts(result);
  const risks = securityScoreData.topRisks?.length
    ? notice('peach', '主要なリスク', bulletList(securityScoreData.topRisks))
    : '';
  const hidden = securityScoreData.issues.length - SECURITY_ISSUE_TABLE_ROW_LIMIT;
  const issues = securityScoreData.issues.length
    ? panel(table(['種別', 'カテゴリ', '内容', 'ファイル', '対策'], securityScoreData.issues.slice(0, SECURITY_ISSUE_TABLE_ROW_LIMIT).map(renderSecurityIssueRow), { more: hidden > 0 ? '他 ' + hidden + ' 件を除外表示' : undefined }), { title: '検出された脆弱性の詳細' })
    : notice('mint', 'セキュリティ上の重大な問題は検出されませんでした', '');

  return section('セキュリティスコア', `
    <div class="grid grid-2">
      ${scoreCard({ label: 'セキュリティスコア', score: securityScoreData.overallScore, grade: securityScoreData.grade, headline: securityHeadline(productionFindings), note: securityScoreData.explanation, tone: gradeTone(securityScoreData.grade) })}
      <div>
        ${countCard('重要度別分布', [
          { label: 'Critical', count: summary.critical, tone: 'rose' },
          { label: 'High', count: summary.high, tone: 'peach' },
          { label: 'Medium', count: summary.medium, tone: 'butter' },
          { label: 'Low', count: summary.low + summary.info, tone: 'sky' },
        ], { empty: testFindings ? 'テストコード ' + testFindings : '指摘なし' })}
        ${risks}
      </div>
    </div>
    ${issues}`);
}
