import path from 'node:path';
import type { AnalysisResult, SecurityIssue } from '../../types';
import { ISSUE_SEVERITY_SCORE_THRESHOLDS, CYCLE_LENGTH_THRESHOLDS } from '../../analyzer/technicalDebt';
import { escapeHtml, scriptJson } from '../../html';

const SECURITY_ISSUE_TABLE_ROW_LIMIT = 40;

export function technicalDebtSection(result: AnalysisResult): string {
  if (!result.technicalDebt) return '';
  const technicalDebt = result.technicalDebt;
  const { critical: criticalScoreMax, high: highScoreMax } = ISSUE_SEVERITY_SCORE_THRESHOLDS;
  const { critical: criticalCycleLen, highMax: highCycleLenMax, medium: mediumCycleLen } = CYCLE_LENGTH_THRESHOLDS;
  const criticalGodClasses = result.godClasses.filter((godClass) => godClass.rank === 'critical').length;
  const highGodClasses = result.godClasses.filter((godClass) => godClass.rank === 'high').length;
  const criticalCycles = result.circularDependencies.filter((dependency) => dependency.length > criticalCycleLen).length;
  const highCycles = result.circularDependencies.filter((dependency) => dependency.length > mediumCycleLen && dependency.length <= highCycleLenMax).length;
  const criticalMetrics = (technicalDebt.metrics.codeComplexity < criticalScoreMax ? 1 : 0) + (technicalDebt.metrics.maintainability < criticalScoreMax ? 1 : 0);
  const highMetrics = (technicalDebt.metrics.codeComplexity >= criticalScoreMax && technicalDebt.metrics.codeComplexity < highScoreMax ? 1 : 0)
    + (technicalDebt.metrics.maintainability >= criticalScoreMax && technicalDebt.metrics.maintainability < highScoreMax ? 1 : 0)
    + (technicalDebt.metrics.circularDeps < highScoreMax ? 1 : 0);
  const metricList = [
    { key: 'codeComplexity', label: 'コード複雑度', score: technicalDebt.metrics.codeComplexity, detail: technicalDebt.metricsDetail?.codeComplexity },
    { key: 'maintainability', label: '保守性', score: technicalDebt.metrics.maintainability, detail: technicalDebt.metricsDetail?.maintainability },
    { key: 'circularDeps', label: '循環依存', score: technicalDebt.metrics.circularDeps, detail: technicalDebt.metricsDetail?.circularDeps },
  ];

  return `
  <section>
    <h2>技術負債スコア</h2>
    <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px; margin-bottom: 20px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; color: white;">
          <div style="font-size: 3em; font-weight: bold;">${technicalDebt.overallScore}</div>
          <div style="font-size: 1.1em; margin-top: 8px;">Overall Score</div>
          <div style="font-size: 1.5em; margin-top: 8px;">Grade: ${technicalDebt.grade}</div>
          <div style="margin-top: 20px; font-size: 0.95em; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 15px;">
            <div style="margin: 5px 0;">Critical: ${technicalDebt.issues.critical}</div>
            <div style="margin: 5px 0;">High: ${technicalDebt.issues.high}</div>
            <div style="margin: 5px 0;">Medium: ${technicalDebt.issues.medium}</div>
            <div style="margin: 5px 0;">Low: ${technicalDebt.issues.low}</div>
          </div>
          <div style="margin-top: 15px; padding: 12px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; font-size: 0.9em;">
            <div style="font-weight: 600; margin-bottom: 6px;">検出課題 (Critical/High) の内訳</div>
            <div style="display: grid; grid-template-columns: 1fr; gap: 6px; text-align: left;">
              <div>God Class: Critical ${criticalGodClasses} / High ${highGodClasses}</div>
              <div>循環依存: Critical ${criticalCycles} / High ${highCycles}</div>
              <div>メトリクス閾値: Critical ${criticalMetrics} / High ${highMetrics}</div>
            </div>
          </div>
        </div>
        <div style="padding: 15px;">
          <h3 style="margin-bottom: 15px; color: #374151;">メトリクス詳細</h3>
          <div style="display: grid; gap: 10px;">
            ${metricList.map((metric) => `<div style="display: flex; justify-content: space-between; padding: 10px; background: #f9fafb; border-radius: 4px;">
              <span>${metric.label}${metric.detail?.includedInOverall === false ? ' <span style="font-size:0.8em;color:#6b7280;">(総合点対象外)</span>' : ''}:</span>
              <strong style="color: ${scoreColor(metric.score)};">${metric.score}/100</strong>
            </div>`).join('')}
          </div>
          <div style="margin-top: 15px; padding: 12px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px; font-size: 0.9em; color: #1e3a8a;">
            ${technicalDebt.summary}
          </div>
          <div style="margin-top: 10px; font-size: 0.82em; color: #6b7280;">
            未実装のメトリクスは表示のみ行い、総合点には含めていません。
          </div>
        </div>
      </div>

      ${metricList.map((metric) => renderMetricDetailCard(metric)).join('')}

      ${technicalDebt.recommendations?.length ? `<div style="background: #f0f9ff; padding: 15px; border-radius: 6px; border-left: 4px solid #3b82f6; margin-top: 20px;">
        <h3 style="margin-bottom: 10px; color: #1e40af;">推奨事項</h3>
        <ul style="margin-left: 20px; font-size: 0.9em; color: #1e3a8a;">
          ${technicalDebt.recommendations.map((recommendation) => `<li style="margin: 6px 0;">${recommendation}</li>`).join('')}
        </ul>
      </div>` : ''}
    </div>
  </section>`;
}

export function securitySection(result: AnalysisResult): string {
  if (!result.securityScore) return '';
  const securityScoreData = result.securityScore;

  return `
  <section>
    <h2>セキュリティスコア</h2>
    <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px; margin-bottom: 20px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 8px; color: white;">
          <div style="font-size: 3em; font-weight: bold;">${securityScoreData.overallScore}</div>
          <div style="font-size: 1.1em; margin-top: 8px;">Security Score</div>
          <div style="font-size: 1.5em; margin-top: 8px;">Grade: ${securityScoreData.grade}</div>
          <div style="margin-top: 20px; font-size: 0.95em; border-top: 1px solid rgba(255,255,255,0.3); padding-top: 15px;">
            <div style="margin: 5px 0;">Critical: ${securityScoreData.summary.critical}</div>
            <div style="margin: 5px 0;">High: ${securityScoreData.summary.high}</div>
            <div style="margin: 5px 0;">Medium: ${securityScoreData.summary.medium}</div>
            <div style="margin: 5px 0;">Low: ${securityScoreData.summary.low}</div>
          </div>
        </div>
        <div style="padding: 15px;">
          <h3 style="margin-bottom: 15px; color: #374151;">検出された脆弱性</h3>
          <div style="padding: 12px; background: #f0f9ff; border-left: 4px solid #3b82f6; border-radius: 4px; font-size: 0.9em; color: #1e3a8a; margin-bottom: 15px;">
            ${securityScoreData.explanation}
          </div>
          ${securityScoreData.topRisks?.length ? `
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; padding: 12px; margin-top: 15px;">
            <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">主要なリスク</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.85em; color: #78350f;">
              ${securityScoreData.topRisks.map((risk) => `<li style="margin: 4px 0;">${risk}</li>`).join('')}
            </ul>
          </div>` : ''}
        </div>
      </div>

      <h3 style="margin-top: 20px; margin-bottom: 15px; color: #374151;">検出された脆弱性の詳細</h3>
      ${securityScoreData.issues.length ? `
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead>
            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">種別</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">カテゴリ</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">内容</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">ファイル</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">対策</th>
            </tr>
          </thead>
          <tbody>
            ${securityScoreData.issues.slice(0, SECURITY_ISSUE_TABLE_ROW_LIMIT).map((issue) => renderSecurityIssueRow(issue)).join('')}
          </tbody>
        </table>
      </div>` : `<div style="text-align: center; color: #059669; padding: 30px; background: #f0fdf4; border-radius: 6px; font-weight: 500;">セキュリティ上の重大な問題は検出されませんでした</div>`}

      <div style="margin-top: 30px; background: #f9fafb; border-radius: 8px; padding: 20px;">
        <h3 style="margin-bottom: 15px; color: #374151;">重要度別分布</h3>
        <canvas id="securityDoughnutChart" height="120"></canvas>
      </div>
    </div>
    <script>
      (function(){
        new Chart(document.getElementById('securityDoughnutChart'), {
          type: 'doughnut',
          data: { labels:['Critical','High','Medium','Low'], datasets:[{ data:[${securityScoreData.summary.critical},${securityScoreData.summary.high},${securityScoreData.summary.medium},${securityScoreData.summary.low}], backgroundColor:['#dc2626','#d97706','#2563eb','#6b7280'] }] },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
      })();
    </script>
  </section>`;
}

function renderMetricDetailCard(metric: { label: string; score: number; detail: any }): string {
  return `
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin-bottom: 15px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h4 style="margin: 0; color: #1f2937;">${metric.label}</h4>
        <div style="display:flex; align-items:center; gap:8px;">
          ${metric.detail?.includedInOverall === false ? '<span style="font-size:0.75em; padding:3px 8px; border-radius:999px; background:#e5e7eb; color:#4b5563;">総合点対象外</span>' : ''}
          <div style="font-size: 1.3em; font-weight: bold; color: ${scoreColor(metric.score)};">${metric.score}/100</div>
        </div>
      </div>
      <div style="font-size: 0.9em; color: #6b7280; margin-bottom: 10px;">${metric.detail?.explanation || '-'}</div>
      ${metric.detail?.problems?.length ? `<div style="background: #fee2e2; border-left: 3px solid #dc2626; padding: 10px; margin-bottom: 8px; border-radius: 4px;"><div style="font-weight: 600; color: #991b1b; margin-bottom: 5px;">問題点:</div><ul style="margin: 0; padding-left: 20px; font-size: 0.85em; color: #7f1d1d;">${metric.detail.problems.map((problem: string) => `<li>${problem}</li>`).join('')}</ul></div>` : ''}
      ${metric.detail?.goodPoints?.length ? `<div style="background: #d1fae5; border-left: 3px solid #059669; padding: 10px; border-radius: 4px;"><div style="font-weight: 600; color: #065f46; margin-bottom: 5px;">良好な点:</div><ul style="margin: 0; padding-left: 20px; font-size: 0.85em; color: #064e3b;">${metric.detail.goodPoints.map((goodPoint: string) => `<li>${goodPoint}</li>`).join('')}</ul></div>` : ''}
    </div>`;
}

function renderSecurityIssueRow(issue: SecurityIssue): string {
  return `<tr style="border-bottom: 1px solid #e5e7eb;">
    <td style="padding: 12px;"><span style="${severityStyle(issue.type)} padding: 4px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600; text-transform: uppercase;">${issue.type}</span></td>
    <td style="padding: 12px; color: #374151;">${issue.category}</td>
    <td style="padding: 12px; color: #6b7280;">${issue.description}</td>
    <td style="padding: 12px; color: #1f2937;"><code style="background: #f3f4f6; padding: 3px 6px; border-radius: 3px; font-size: 0.85em;">${escapeHtml(path.basename(issue.filePath))}${issue.lineNumber ? `:${issue.lineNumber}` : ''}</code></td>
    <td style="padding: 12px; color: #6b7280;">${issue.recommendation}</td>
  </tr>`;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#059669';
  if (score >= 60) return '#d97706';
  return '#dc2626';
}

function severityStyle(severity: string): string {
  switch (severity) {
    case 'critical': return 'background:#dc2626;color:#fff;';
    case 'high': return 'background:#d97706;color:#fff;';
    case 'medium': return 'background:#2563eb;color:#fff;';
    case 'low': return 'background:#6b7280;color:#fff;';
    default: return 'background:#9ca3af;color:#111827;';
  }
}