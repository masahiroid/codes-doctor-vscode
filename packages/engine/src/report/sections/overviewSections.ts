import path from 'node:path';
import type { AnalysisResult } from '../../types';
import { isThinOrchestrationModule } from '../../analyzer/moduleClassification';
import { LANGUAGES } from '../../analyzer/languages/catalog';
import { escapeHtml, scriptJson } from '../../html';
import {
  badge, countCard, gradeTone, histogram, HistogramBin, meter, nameWithPath, notice, panel, scoreCard, section, stat, table, Tone,
} from '../ui';
import { paletteDeclaration } from '../browser/theme';
import { debtHeadline, securityFindingCounts, securityHeadline } from './verdicts';

/** Instability above this is reported as "unstable" in the report table */
const UNSTABLE_INSTABILITY_THRESHOLD = 0.8;
/** Instability at or below this is reported as "stable" */
const STABLE_INSTABILITY_THRESHOLD = 0.5;

/** Row count caps for large tables in the report */
const GOD_CLASS_TABLE_ROW_LIMIT = 30;
const MODULE_METRICS_TABLE_ROW_LIMIT = 30;
const FILE_TABLE_ROW_LIMIT = 60;

/** Histogram bins for the God Class score distribution: upper bound and tone. */
const GOD_SCORE_BINS: ReadonlyArray<{ upper: number; tone: Tone }> = [
  { upper: 20, tone: 'mint' }, { upper: 40, tone: 'sky' }, { upper: 60, tone: 'butter' }, { upper: 80, tone: 'peach' }, { upper: 100, tone: 'rose' },
];
/** Histogram bins for file sizes in lines; the last bin is open-ended. */
const FILE_SIZE_BINS: ReadonlyArray<{ upper: number; tone: Tone }> = [
  { upper: 100, tone: 'mint' }, { upper: 300, tone: 'sky' }, { upper: 500, tone: 'butter' }, { upper: 1000, tone: 'peach' }, { upper: Infinity, tone: 'rose' },
];

/** God Class ranks to tones. */
const RANK_TONES: Record<string, Tone> = { critical: 'rose', high: 'peach', medium: 'butter', low: 'mint' };


/** File path display truncation length in the module metrics table */
const MODULE_PATH_DISPLAY_MAX_LENGTH = 50;
/** Bubble radius range (pixels) and the lines of code per pixel of radius. */
const BUBBLE_RADIUS = { min: 3, max: 20, linesPerPixel: 30 } as const;
/** Bubble opacity range, scaled by centrality. */
const BUBBLE_ALPHA = { min: 0.25, range: 0.6 } as const;
/** Heatmap cell tint range (percent of the tone), scaled by the cell's share of the maximum. */
const HEATMAP_TINT = { min: 18, range: 72 } as const;

/** Comma-separated list of supported language names, for the "no supported files found" banner. */
const SUPPORTED_LANGUAGE_NAMES = LANGUAGES.map((language) => language.label).join('、');

function bucket<T extends { upper: number; tone: Tone }>(bins: readonly T[], values: number[], label: (lower: number, upper: number) => string): HistogramBin[] {
  const counts = bins.map(() => 0);
  for (const value of values) counts[bins.findIndex((bin) => value <= bin.upper)] += 1;
  return bins.map((bin, index) => ({
    label: label(index === 0 ? 0 : bins[index - 1].upper + 1, bin.upper),
    count: counts[index],
    tone: bin.tone,
  }));
}

function debtScoreCard(result: AnalysisResult, scored: boolean): string {
  const debt = result.technicalDebt;
  const concentrated = result.godClasses.filter((godClass) => godClass.rank === 'critical' || godClass.rank === 'high').slice(0, 2);
  if (!scored || !debt) {
    return scoreCard({ label: '技術負債スコア', score: null, grade: '', headline: '解析対象がありません', tone: 'lavender' });
  }
  return scoreCard({
    label: '技術負債スコア',
    score: debt.overallScore,
    grade: debt.grade,
    headline: debtHeadline(debt.grade),
    note: concentrated.length ? `${concentrated.map((godClass) => escapeHtml(godClass.className)).join(' と ')} に責務が集中しています。` : undefined,
    tone: 'lavender',
  });
}

function securityScoreCard(result: AnalysisResult, scored: boolean): string {
  const security = result.securityScore;
  if (!scored || !security) {
    return scoreCard({ label: 'セキュリティスコア', score: null, grade: '', headline: '解析対象がありません', tone: 'mint' });
  }
  const { production: productionFindings, test: testFindings } = securityFindingCounts(result);
  return scoreCard({
    label: 'セキュリティスコア',
    score: security.overallScore,
    grade: security.grade,
    headline: securityHeadline(productionFindings),
    note: testFindings > 0 ? `テストコード内の ${testFindings} 件はスコアに含めていません。` : undefined,
    tone: gradeTone(security.grade),
  });
}

function findingCards(result: AnalysisResult): string {
  const debtIssues = result.technicalDebt?.issues ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const securitySummary = result.securityScore?.summary ?? { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const testFindings = result.securityScore?.issues.filter((issue) => issue.inTest).length ?? 0;
  const scan = result.vulnerabilityScan;
  const scanner = scan?.source === 'trivy' ? 'Trivy' : 'npm audit';
  return `<div class="grid grid-3">
    ${countCard('技術負債の課題', [
      { label: 'Critical', count: debtIssues.critical, tone: 'rose' },
      { label: 'High', count: debtIssues.high, tone: 'peach' },
      { label: 'Medium', count: debtIssues.medium, tone: 'butter' },
      { label: 'Low', count: debtIssues.low, tone: 'sky' },
    ], { empty: '課題なし' })}
    ${countCard('セキュリティの指摘', [
      { label: 'Critical', count: securitySummary.critical, tone: 'rose' },
      { label: 'High', count: securitySummary.high, tone: 'peach' },
      { label: 'Medium', count: securitySummary.medium, tone: 'butter' },
      { label: 'Low', count: securitySummary.low + securitySummary.info, tone: 'sky' },
    ], { empty: testFindings ? `テストコード ${testFindings}` : '指摘なし' })}
    ${countCard('依存パッケージの脆弱性', [
      { label: 'Critical', count: scan?.critical ?? 0, tone: 'rose' },
      { label: 'High', count: scan?.high ?? 0, tone: 'peach' },
      { label: 'Moderate', count: scan?.moderate ?? 0, tone: 'butter' },
      { label: 'Low', count: scan?.low ?? 0, tone: 'sky' },
    ], { empty: scan ? `既知の脆弱性なし（${scanner}）` : '未スキャン' })}
  </div>`;
}

export function summarySection(result: AnalysisResult): string {
  const scored = result.summary.totalFiles > 0;
  const noFilesBanner = scored
    ? ''
    : notice('rose', '対応言語のファイルが見つかりませんでした', `<p>このワークスペースには、現在対応している言語（${SUPPORTED_LANGUAGE_NAMES}）のファイルがありませんでした。以下のスコアは「問題なし」ではなく「解析対象がなかった」ことを示しています。未対応の言語を使用している可能性があります。</p>`);
  const stats = `<div class="stats panel glass">
    ${stat('ファイル', result.summary.totalFiles)}
    ${stat('クラス', result.summary.totalClasses)}
    ${stat('平均 God スコア', result.summary.avgGodScore, { suffix: '/ 100' })}
    ${stat('循環依存', result.circularDependencies.length, { tone: result.circularDependencies.length ? 'peach' : undefined })}
  </div>`;
  return section('概要', `${noFilesBanner}<div class="grid grid-3">${debtScoreCard(result, scored)}${securityScoreCard(result, scored)}${stats}</div>${findingCards(result)}`);
}

export function godClassSection(result: AnalysisResult): string {
  if (!result.godClasses.length) {
    return section('God クラス ランキング', panel('<p class="muted">God クラスが見つかりません</p>'));
  }

  const rows = result.godClasses.slice(0, GOD_CLASS_TABLE_ROW_LIMIT).map((godClass) => `<tr>
    <td>${nameWithPath(godClass.className, path.basename(godClass.filePath))}</td>
    <td class="num">${godClass.methodCount}</td><td class="num">${godClass.lineCount}</td><td class="num">${godClass.importCount}</td>
    <td>${meter(godClass.godScore, RANK_TONES[godClass.rank] ?? 'lavender')}</td>
    <td>${badge(godClass.rank, RANK_TONES[godClass.rank] ?? 'lavender', { upper: true })}</td>
  </tr>`);
  const hidden = result.godClasses.length - GOD_CLASS_TABLE_ROW_LIMIT;
  const bins = bucket(GOD_SCORE_BINS, result.godClasses.map((godClass) => godClass.godScore), (lower, upper) => `${lower}–${upper}`);

  return section('God クラス ランキング', `<div class="grid grid-wide">
    ${panel(table(['クラス名', '#メソッド', '#行数', '#インポート', 'スコア', 'ランク'], rows, { more: hidden > 0 ? `他 ${hidden} 件を除外表示` : undefined }), { title: '責務が集中しているクラス', sub: 'God スコアの高い順。60 以上は分割を検討する目安です。' })}
    ${panel(histogram(bins), { title: 'God Class スコア分布', sub: `${result.godClasses.length} クラス` })}
  </div>`);
}

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

export function layerSection(result: AnalysisResult): string {
  if (!result.layerHeatmap?.layers?.length) return '';
  const { layers, matrix } = result.layerHeatmap;
  const maxValue = Math.max(1, ...matrix.flat());
  const rows = layers.map((layer) => `<tr><td class="cell-main">${escapeHtml(layer.name)}</td><td class="num">${layer.fileCount}</td><td class="num">${layer.classCount}</td><td class="num">${layer.avgComplexity}</td><td class="muted">${escapeHtml(layer.dependencies.join(', ') || 'なし')}</td></tr>`);
  const heatmap = `<div class="table-wrap"><table class="heatmap">
    <tr><th></th>${layers.map((layer) => `<th>${escapeHtml(layer.name)}</th>`).join('')}</tr>
    ${layers.map((layer, i) => `<tr><th>${escapeHtml(layer.name)}</th>${layers.map((_, j) => {
      const value = matrix[i][j];
      const tint = value > 0 ? HEATMAP_TINT.min + (value / maxValue) * HEATMAP_TINT.range : 0;
      const background = value > 0 ? `color-mix(in srgb, var(--sky) ${tint.toFixed(0)}%, transparent)` : 'var(--well)';
      return `<td style="background:${background}">${value || ''}</td>`;
    }).join('')}</tr>`).join('')}
  </table></div>`;

  return section('アーキテクチャレイヤー分析', `<div class="grid grid-2">
    ${panel(table(['レイヤー名', '#ファイル数', '#クラス数', '#平均複雑度', '依存先'], rows))}
    ${panel(heatmap, { title: 'レイヤー依存ヒートマップ', sub: '行のレイヤーが列のレイヤーに依存している数' })}
  </div>`);
}

export function fileStatsSection(result: AnalysisResult): string {
  const files = LANGUAGES.flatMap((language) =>
    result.files[language.id].map((fileInfo) => ({
      name: path.basename(fileInfo.filePath),
      lang: language.label,
      classes: fileInfo.classes.length,
      lineCount: fileInfo.lineCount,
    }))
  );
  if (files.length === 0) return '';

  const rows = [...files].sort((a, b) => b.lineCount - a.lineCount).slice(0, FILE_TABLE_ROW_LIMIT)
    .map((fileInfo) => `<tr><td class="cell-main">${escapeHtml(fileInfo.name)}</td><td>${badge(fileInfo.lang, 'sky')}</td><td class="num">${fileInfo.classes}</td><td class="num">${fileInfo.lineCount}</td></tr>`);
  const hidden = files.length - FILE_TABLE_ROW_LIMIT;
  const sizeLabel = (lower: number, upper: number) => (Number.isFinite(upper) ? `${lower}–${upper}` : `${lower}+`);
  const bins = bucket(FILE_SIZE_BINS, files.map((fileInfo) => fileInfo.lineCount), sizeLabel);

  return section('ファイル統計', `<div class="grid grid-wide">
    ${panel(table(['ファイル名', '言語', '#クラス数', '#行数'], rows, { more: hidden > 0 ? `他 ${hidden} 件を除外表示` : undefined }), { sub: '行数の多い順' })}
    ${panel(histogram(bins), { title: 'ファイルサイズ分布', sub: `${files.length} ファイル（行数）` })}
  </div>`);
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

