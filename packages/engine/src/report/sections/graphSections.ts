import { buildD3DependencyGraph, generateD3VisualizationScript } from '../../graph/d3Graph';
import type { AnalysisResult } from '../../types';
import { escapeHtml } from '../../html';
import { badge, bulletList, notice, panel, section, table, Tone } from '../ui';
import { CYCLE_LENGTH_THRESHOLDS } from '../../analyzer/technicalDebt';

/** Shown when classes exist but none depends on another: the graph has nodes only. */
const NO_CLASS_LINKS_NOTE = '<p class="muted gap-bottom">クラスは検出されましたが、クラス間の内部依存は検出されませんでした。ノードのみ表示します。</p>';

/** Zoom steps and bounds for the circular-dependency diagram. */
const ZOOM = { step: 0.1, min: 0.3, max: 3 } as const;

/** Cycle edges drawn in the circular-dependency diagram before it is truncated. */
const MAX_CYCLE_EDGES = 80;
/** djb2 string hash, used for stable Mermaid node IDs of non-word labels. */
const DJB2_SEED = 5381;
const DJB2_MULTIPLIER = 33;
const BASE36 = 36;

const LONGEST_CYCLES_DISPLAY_LIMIT = 2;
const CYCLE_PATH_PREVIEW_LENGTH = 3;

export function mermaidSection(title: string, graphText: string): string {
  return section(title, `<div class="diagram panel glass"><div class="mermaid">${graphText}</div></div>`);
}

/**
 * Read-only display of the LLM structural review. All configuration (provider, API key,
 * model) and the "run" action live in the VS Code extension's Dashboard panel only —
 * this report is a static file with no place to hold secrets or settings of its own.
 * Re-running from the Dashboard patches this saved result back into the report in place.
 */
export function llmSection(result: AnalysisResult, savedResult?: string): string {
  const initialContent = savedResult
    ? escapeHtml(savedResult)
    : '未実行。VS Code拡張のダッシュボードパネルから「Run LLM Review」を実行してください。';
  const initialDataMd = savedResult ? escapeHtml(savedResult) : '';
  const initialStatus = savedResult ? `<p class="muted gap-bottom">レポート生成時の保存済み結果</p>` : '';

  return section('LLM 構造解析', `
    ${panel(`${initialStatus}<div id="llmResult" class="llm-result" data-md="${initialDataMd}">${initialContent}</div>`, {
      title: '構造レビュー',
      sub: '構造レビューは、モジュール依存グラフ・関数呼び出しグラフ・God Class分布をまとめて解釈し、このままで良いのか、優先改善が必要かを判断します。設定と再実行は VS Code拡張のダッシュボードパネルから行います。',
    })}
    ${panel('<div id="llmAgentPrompt" class="llm-result" data-md="">未生成です。</div>', {
      title: 'AIコーディング用プロンプト',
      sub: 'AIコーディングエージェントにそのまま渡せる作業指示です。ダッシュボードの出力モードを切り替えて実行すると生成されます。',
    })}`, 'sec-llm');
}

export function circularSection(result: AnalysisResult): string {
  if (!result.circularDependencies?.length) return '';
  // Note: >= here (not >, as technicalDebt.ts uses for its own "critical" bucket) —
  // this section's "complex" label intentionally includes length === 5 too.
  const complexCycles = result.circularDependencies.filter((dependency) => dependency.length >= CYCLE_LENGTH_THRESHOLDS.critical);
  const simpleCycles = result.circularDependencies.filter((dependency) => dependency.length <= CYCLE_LENGTH_THRESHOLDS.low);
  const longest = [...result.circularDependencies].sort((left, right) => right.length - left.length).slice(0, LONGEST_CYCLES_DISPLAY_LIMIT);
  const longestSummary = longest.map((dependency) => dependency.cycle.slice(0, CYCLE_PATH_PREVIEW_LENGTH).join(' → ') + '... (長さ' + dependency.length + ')').join(' / ');
  const mermaid = buildCircularDependencyMermaid(result.circularDependencies);
  const analysis = bulletList([
    `${result.circularDependencies.length}個の循環依存が検出されました`,
    `${complexCycles.length}個の複雑な循環依存（長さ5以上）が存在します`,
    `${simpleCycles.length}個は単純な相互参照（長さ2以下）です`,
    ...(longest.length ? [`最長循環: ${escapeHtml(longestSummary)}`] : []),
  ]);

  return section('循環依存検出', `
    ${notice('peach', `${result.circularDependencies.length} 件の循環依存が検出されました`, '')}
    ${panel(table(['No.', '#長さ', '循環経路', '分類'], result.circularDependencies.map(renderCircularRow)))}
    <div class="diagram panel glass">
      <div class="toolbar">
        <button type="button" class="btn" id="cycleZoomIn">+</button>
        <button type="button" class="btn" id="cycleZoomOut">-</button>
        <button type="button" class="btn" id="cycleZoomReset">Reset</button>
      </div>
      <div id="cycleMermaid" class="mermaid" style="transform-origin: 0 0;">${mermaid}</div>
    </div>
    <script>
      (function(){
        const target = document.getElementById('cycleMermaid');
        let scale = 1;
        const apply = function(next) { scale = next; target.style.transform = 'scale(' + scale.toFixed(2) + ')'; };
        document.getElementById('cycleZoomIn').addEventListener('click', function() { apply(Math.min(scale + ${ZOOM.step}, ${ZOOM.max})); });
        document.getElementById('cycleZoomOut').addEventListener('click', function() { apply(Math.max(scale - ${ZOOM.step}, ${ZOOM.min})); });
        document.getElementById('cycleZoomReset').addEventListener('click', function() { apply(1); });
      })();
    </script>
    ${notice('sky', '循環依存の分析', analysis)}`);
}

export function generateD3DependencyGraphSection(result: AnalysisResult): string {
  if (!result.files) return '';
  const graph = buildD3DependencyGraph(result.files.typescript, result.files.php);
  if (graph.nodes.length === 0) {
    return section('クラス依存グラフ (D3.js)', panel('<p class="muted">依存データがありません</p>'));
  }
  return section('クラス依存グラフ (D3.js)', panel(`${graph.links.length === 0 ? NO_CLASS_LINKS_NOTE : ''}${generateD3VisualizationScript(graph)}`));
}

function renderCircularRow(dependency: AnalysisResult['circularDependencies'][number], index: number): string {
  const { label, tone } = getCycleCategory(dependency.length);
  return `<tr>
    <td class="cell-main">Cycle ${index + 1}</td>
    <td class="num">${dependency.length}</td>
    <td class="cell-sub">${escapeHtml(dependency.cycle.join(' → '))}</td>
    <td>${badge(label, tone)}</td>
  </tr>`;
}

/** Cycle lengths: at least this many modules is complex; at most `simpleMax` is a simple back-reference. */
const CYCLE_CATEGORY_LENGTHS = { complex: 5, simpleMax: 2 } as const;

function getCycleCategory(length: number): { label: string; tone: Tone } {
  if (length >= CYCLE_CATEGORY_LENGTHS.complex) return { label: '複雑', tone: 'rose' };
  if (length <= CYCLE_CATEGORY_LENGTHS.simpleMax) return { label: '単純', tone: 'mint' };
  return { label: '中程度', tone: 'butter' };
}

function buildCircularDependencyMermaid(cycles: Array<{ cycle: string[] }>): string {
  if (!cycles.length) {
    return String.raw`graph LR
  note["No cycles detected"]`;
  }

  const edgeSet = new Set<string>();

  for (const cycle of cycles) {
    const cyclePath = cycle.cycle.length > 1 ? cycle.cycle : [];
    for (let index = 0; index < cyclePath.length - 1; index += 1) {
      const from = cyclePath[index];
      const to = cyclePath[index + 1];
      edgeSet.add(`${from}-->${to}`);
    }
  }

  const edges = Array.from(edgeSet).slice(0, MAX_CYCLE_EDGES);
  const lines = ['graph LR'];

  for (const edge of edges) {
    const [from, to] = edge.split('-->');
    const fromId = toMermaidNodeId(from);
    const toId = toMermaidNodeId(to);
    lines.push(`  ${fromId}["${escapeMermaidLabel(from)}"] --> ${toId}["${escapeMermaidLabel(to)}"]`);
  }

  if (edgeSet.size > MAX_CYCLE_EDGES) {
    lines.push(`  note["Showing ${MAX_CYCLE_EDGES} of ${edgeSet.size} cycle edges"]`);
  }

  return lines.join('\n');
}

function toMermaidNodeId(value: string): string {
  const base = value.replaceAll(/\W/g, '_');
  return base.length > 0 ? `n_${base}` : `n_${hashString(value)}`;
}

function escapeMermaidLabel(value: string): string {
  return value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll('"', String.raw`\"`)
    .replaceAll(/[^\w\s\-./]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function hashString(value: string): string {
  let hash = DJB2_SEED;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * DJB2_MULTIPLIER) ^ (value.codePointAt(index) || 0);
  }
  return (hash >>> 0).toString(BASE36);
}

