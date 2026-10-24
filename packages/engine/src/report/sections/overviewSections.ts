import path from 'node:path';
import type { AnalysisResult } from '../../types';
import { LANGUAGES } from '../../analyzer/languages/catalog';
import { escapeHtml } from '../../html';
import {
  badge, countCard, gradeTone, histogram, HistogramBin, meter, nameWithPath, notice, panel, scoreCard, section, stat, table, Tone,
} from '../ui';
import { debtHeadline, securityFindingCounts, securityHeadline } from './verdicts';

// The module coupling section has its own module; it stays exported here for existing importers.
export { moduleMetricsSection } from './moduleMetricsSection';

/** Row count caps for large tables in the report */
const GOD_CLASS_TABLE_ROW_LIMIT = 30;
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
