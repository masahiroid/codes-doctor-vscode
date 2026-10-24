import type { AnalysisResult } from '../../types';
import { isThinOrchestrationModule } from '../../analyzer/moduleClassification';
import { scriptJson } from '../../html';
import { badge, nameWithPath, notice, panel, section, stat, table, Tone } from '../ui';
import { paletteDeclaration } from '../browser/theme';

/**
 * The module coupling section: how modules are classified (unstable, stable, thin entrypoint),
 * the metrics table and the fan-in / fan-out bubble chart.
 */

/** Instability above this is reported as "unstable" in the report table */
const UNSTABLE_INSTABILITY_THRESHOLD = 0.8;
/** Instability at or below this is reported as "stable" */
const STABLE_INSTABILITY_THRESHOLD = 0.5;

const MODULE_METRICS_TABLE_ROW_LIMIT = 30;

/** File path display truncation length in the module metrics table */
const MODULE_PATH_DISPLAY_MAX_LENGTH = 50;
/** Bubble radius range (pixels) and the lines of code per pixel of radius. */
const BUBBLE_RADIUS = { min: 3, max: 20, linesPerPixel: 30 } as const;
/** Bubble opacity range, scaled by centrality. */
const BUBBLE_ALPHA = { min: 0.25, range: 0.6 } as const;

export function moduleMetricsSection(result: AnalysisResult): string {
  if (!result.moduleMetrics?.length) {
    return section('モジュール結合度メトリクス', panel('<p class="muted">モジュールメトリクス情報がありません</p>'));
  }

  const unstableCount = result.moduleMetrics.filter(
    (metric) => metric.instability > UNSTABLE_INSTABILITY_THRESHOLD && !isThinOrchestrationModule(metric)
  ).length;
  const thinOrchestrationCount = result.moduleMetrics.filter((metric) => isThinOrchestrationModule(metric)).length;
  const stableCount = result.moduleMetrics.filter((metric) => metric.instability <= STABLE_INSTABILITY_THRESHOLD).length;
  const avgStructural = result.moduleMetrics.reduce((sum, metric) => sum + metric.structuralScore, 0) / result.moduleMetrics.length;
  const bubble = scriptJson(result.moduleMetrics.map((metric) => {
    const pathPart = metric.filePath.includes('/') ? metric.filePath.split('/').slice(-2).join('/') : metric.filePath;
    return {
      x: metric.fanOut,
      y: metric.fanIn,
      r: Math.max(BUBBLE_RADIUS.min, Math.min(BUBBLE_RADIUS.max, metric.lineCount / BUBBLE_RADIUS.linesPerPixel)),
      centrality: metric.centrality,
      label: `${metric.moduleName} (${pathPart})`,
    };
  }));

  const stats = `<div class="stats panel glass">
    ${stat('総モジュール数', result.moduleMetrics.length)}
    ${stat('不安定モジュール', unstableCount, { tone: 'peach' })}
    ${stat('軽量入口モジュール', thinOrchestrationCount, { tone: 'lavender' })}
    ${stat('安定モジュール', stableCount, { tone: 'mint' })}
    ${stat('平均構造スコア', avgStructural.toFixed(1))}
  </div>`;
  const guide = notice('lavender', '評価の見方', `<ul class="list">
    <li>軽量入口: 起動点・エントリーポイント・薄い中継モジュールです。Instability が高くても、それだけで悪い設計とは限りません。</li>
    <li>不安定: 依存先が多く変更の影響を受けやすい候補です。ただし、入口モジュールでは自然な場合があります。</li>
    <li>本当に注意すべきなのは、行数が多い、fan-out が高い、構造スコアが低い、呼び出しや依存が集中しているモジュールです。</li>
    <li>詳細な判断は下の構造レビューで、モジュール依存グラフ・関数呼び出しグラフ・God Class 分布をまとめて解釈します。</li>
  </ul>`);
  const rows = result.moduleMetrics.slice(0, MODULE_METRICS_TABLE_ROW_LIMIT).map((metric) => renderModuleMetricRow(metric));
  const chart = panel(`<div class="chart"><canvas id="moduleMetricsChart" height="130"></canvas></div>`, {
    title: '可視化',
    sub: 'X軸: Fan-out（このモジュールが依存しているモジュール数） ｜ Y軸: Fan-in（このモジュールに依存しているモジュール数） ｜ 円の大きさ: ファイルサイズ（行数） ｜ 色の濃さ: 中心性（Centrality）',
  });

  return section('モジュール結合度メトリクス', `${stats}${guide}
    ${panel(table(['モジュール', '#Fan-in', '#Fan-out', '#Centrality', '#Instability', '#構造スコア', '評価'], rows))}
    ${chart}
    <script>
      (function(){
        ${paletteDeclaration()}
        const data = ${bubble};
        new Chart(document.getElementById('moduleMetricsChart'), {
          type: 'bubble',
          data: { datasets: [{
            data,
            backgroundColor: data.map(function(d) { return palette.alpha('lavender', ${BUBBLE_ALPHA.min} + Math.min(d.centrality, 1) * ${BUBBLE_ALPHA.range}); }),
            borderColor: palette.lavender,
            borderWidth: 1
          }] },
          options: {
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(context) { return context.raw.label; } } } },
            scales: {
              x: { beginAtZero: true, title: { display: true, text: 'Fan-out（依存出口数）' } },
              y: { beginAtZero: true, title: { display: true, text: 'Fan-in（依存入口数）' } }
            }
          }
        });
      })();
    </script>`);
}

function renderModuleMetricRow(metric: AnalysisResult['moduleMetrics'][number]): string {
  const { label, tone } = getInstabilityBadge(metric);
  const displayPath = metric.filePath.length > MODULE_PATH_DISPLAY_MAX_LENGTH
    ? '...' + metric.filePath.slice(-(MODULE_PATH_DISPLAY_MAX_LENGTH - 3))
    : metric.filePath;
  return `<tr><td>${nameWithPath(metric.moduleName, displayPath)}</td><td class="num">${metric.fanIn}</td><td class="num">${metric.fanOut}</td><td class="num">${metric.centrality.toFixed(2)}</td><td class="num">${metric.instability.toFixed(2)}</td><td class="num">${metric.structuralScore.toFixed(1)}</td><td>${badge(label, tone)}</td></tr>`;
}

function getInstabilityBadge(metric: AnalysisResult['moduleMetrics'][number]): { label: string; tone: Tone } {
  if (isThinOrchestrationModule(metric)) return { label: '入口', tone: 'lavender' };
  if (metric.instability > UNSTABLE_INSTABILITY_THRESHOLD) return { label: '不安定', tone: 'rose' };
  if (metric.instability > STABLE_INSTABILITY_THRESHOLD) return { label: '普通', tone: 'butter' };
  return { label: '安定', tone: 'mint' };
}
