import path from 'node:path';
import type { AnalysisResult, SecurityIssue } from '../../types';
import { ISSUE_SEVERITY_SCORE_THRESHOLDS, CYCLE_LENGTH_THRESHOLDS } from '../../analyzer/technicalDebt';
import { escapeHtml } from '../../html';
import { debtHeadline, securityFindingCounts, securityHeadline } from './verdicts';
import { badge, bulletList, countCard, filterableTable, gradeTone, meter, notice, panel, scoreCard, scoreTone, section, severityTone, stat, table } from '../ui';

const SECURITY_ISSUE_TABLE_ROW_LIMIT = 40;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Marks findings in test code, which are listed but do not count toward the score. */
const TEST_CODE_BADGE = badge('テストコード', 'lavender', { title: 'スコアには含めません' });

/** Shown on findings whose input was traced to the call, and on pattern matches that were not. */
const FLOW_BADGE = badge('入力から到達', 'rose', { title: '外部入力がこの呼び出しに届く経路を確認しました' });
const UNTRACED_BADGE = badge('要確認', 'lavender', { title: 'パターンには一致しましたが、外部入力の到達は確認できていません' });
const FLOW_CODE_LENGTH = 120;

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

function flowStep(label: string, step: { line: number; code: string }): string {
  const code = step.code.length > FLOW_CODE_LENGTH ? step.code.slice(0, FLOW_CODE_LENGTH) + '…' : step.code;
  return `<li><span class="k">${label}</span>L${step.line} <code>${escapeHtml(code)}</code></li>`;
}

/** The traced path of a flow finding: where the input enters, how it is passed on, and the call. */
function flowPath(flow: NonNullable<SecurityIssue['flow']>): string {
  if (flow.source.line === flow.sink.line && !flow.steps.length) return `<ol class="flow-path">${flowStep('入力→到達', flow.sink)}</ol>`;
  return `<ol class="flow-path">${[
    flowStep('入力', flow.source),
    ...flow.steps.map((step) => flowStep('経由', step)),
    flowStep('到達', flow.sink),
  ].join('')}</ol>`;
}

function confidenceBadge(issue: SecurityIssue): string {
  if (issue.confidence === 'flow') return ` ${FLOW_BADGE}`;
  return issue.confidence === 'pattern' ? ` ${UNTRACED_BADGE}` : '';
}

function renderSecurityIssueRow(issue: SecurityIssue, index: number, limit: number): string {
  const line = issue.lineNumber ? ':' + issue.lineNumber : '';
  const location = escapeHtml(path.basename(issue.filePath)) + line;
  const isHidden = index >= limit;
  const hideAttr = isHidden ? ' style="display:none;"' : '';
  return `<tr data-severity="${escapeHtml(issue.type)}"${hideAttr}>
    <td>${badge(issue.type, severityTone(issue.type), { upper: true })}</td>
    <td class="cell-main">${issue.category}${confidenceBadge(issue)}${issue.inTest ? ` ${TEST_CODE_BADGE}` : ''}</td>
    <td>${issue.description}${issue.flow ? flowPath(issue.flow) : ''}</td>
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

  const sortedIssues = [...securityScoreData.issues].sort((a, b) => {
    const diff = (SEVERITY_ORDER[a.type] ?? 99) - (SEVERITY_ORDER[b.type] ?? 99);
    if (diff !== 0) return diff;
    const fileDiff = a.filePath.localeCompare(b.filePath);
    if (fileDiff !== 0) return fileDiff;
    return (a.lineNumber || 0) - (b.lineNumber || 0);
  });

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const issue of sortedIssues) {
    counts[issue.type] = (counts[issue.type] || 0) + 1;
  }

  const rows = sortedIssues.map((issue, index) => renderSecurityIssueRow(issue, index, SECURITY_ISSUE_TABLE_ROW_LIMIT));
  const issues = sortedIssues.length
    ? panel(
        filterableTable(['種別', 'カテゴリ', '内容', 'ファイル', '対策'], rows, {
          filterId: 'security-issues',
          limit: SECURITY_ISSUE_TABLE_ROW_LIMIT,
          severities: [
            { id: 'critical', label: 'Critical', count: counts.critical, tone: 'rose' },
            { id: 'high', label: 'High', count: counts.high, tone: 'peach' },
            { id: 'medium', label: 'Medium', count: counts.medium, tone: 'butter' },
            { id: 'low', label: 'Low', count: counts.low, tone: 'sky' },
            { id: 'info', label: 'Info', count: counts.info, tone: 'lavender' },
          ],
        }),
        { title: '検出された脆弱性の詳細' }
      )
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
