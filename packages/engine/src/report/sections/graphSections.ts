import { buildD3DependencyGraph, generateD3VisualizationScript } from '../../graph/d3Graph';
import type { AnalysisResult } from '../../types';
import { escapeHtml } from '../../html';
import { CYCLE_LENGTH_THRESHOLDS } from '../../analyzer/technicalDebt';

/** Shown when classes exist but none depends on another: the graph has nodes only. */
const NO_CLASS_LINKS_NOTE = '<p>クラスは検出されましたが、クラス間の内部依存は検出されませんでした。ノードのみ表示します。</p>';

/** Cycle edges drawn in the circular-dependency diagram before it is truncated. */
const MAX_CYCLE_EDGES = 80;
/** djb2 string hash, used for stable Mermaid node IDs of non-word labels. */
const DJB2_SEED = 5381;
const DJB2_MULTIPLIER = 33;
const BASE36 = 36;

const LONGEST_CYCLES_DISPLAY_LIMIT = 2;
const CYCLE_PATH_PREVIEW_LENGTH = 3;

export function mermaidSection(title: string, graphText: string): string {
  return `
  <section>
    <h2>${title}</h2>
    <div class="diagram"><div class="mermaid">${graphText}</div></div>
  </section>`;
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
  const initialStatus = savedResult ? 'レポート生成時の保存済み結果' : '';

  return `
  <section id="sec-llm">
    <h2>LLM 構造解析</h2>
    <div class="box">
      <div style="margin: 0 0 10px 0; color:#6b7280; font-size:0.88em;">
        構造レビューは、モジュール依存グラフ・関数呼び出しグラフ・God Class分布をまとめて解釈し、このままで良いのか、優先改善が必要かを判断します。設定と再実行は VS Code拡張のダッシュボードパネルから行います。
      </div>
      ${initialStatus ? `<div style="color:#6b7280; font-size:0.9em; margin-bottom:8px;">${initialStatus}</div>` : ''}
      <div id="llmResult" class="llm-result" data-md="${initialDataMd}">${initialContent}</div>
    </div>
    <div class="box" style="border-left-color: #10b981;">
      <h3 style="margin-top: 0;">AIコーディング用プロンプト</h3>
      <div style="margin: 0 0 10px 0; color:#6b7280; font-size:0.88em;">
        AIコーディングエージェントにそのまま渡せる作業指示です。ダッシュボードの出力モードを切り替えて実行すると生成されます。
      </div>
      <div id="llmAgentPrompt" class="llm-result" data-md="">未生成です。</div>
    </div>
  </section>`;
}

export function circularSection(result: AnalysisResult): string {
  if (!result.circularDependencies?.length) return '';
  // Note: >= here (not >, as technicalDebt.ts uses for its own "critical" bucket) —
  // this section's "complex" label intentionally includes length === 5 too.
  const complexCycles = result.circularDependencies.filter((dependency) => dependency.length >= CYCLE_LENGTH_THRESHOLDS.critical);
  const simpleCycles = result.circularDependencies.filter((dependency) => dependency.length <= CYCLE_LENGTH_THRESHOLDS.low);
  const longest = [...result.circularDependencies].sort((left, right) => right.length - left.length).slice(0, LONGEST_CYCLES_DISPLAY_LIMIT);
  const longestSummary = longest.map((dependency) => `${dependency.cycle.slice(0, CYCLE_PATH_PREVIEW_LENGTH).join(' → ')}... (長さ${dependency.length})`).join(' / ');
  const mermaid = buildCircularDependencyMermaid(result.circularDependencies);

  return `
  <section>
    <h2>循環依存検出</h2>
    <div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <div style="padding: 15px; background: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; margin-bottom: 20px;">
        <strong style="color:#991b1b;">${result.circularDependencies.length} 件の循環依存が検出されました</strong>
      </div>
      <div style="overflow-x:auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead>
            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; width: 90px;">No.</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; width: 90px;">長さ</th>
              <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151;">循環経路</th>
              <th style="padding: 12px; text-align: center; font-weight: 600; color: #374151; width: 120px;">分類</th>
            </tr>
          </thead>
          <tbody>
            ${result.circularDependencies.map((dependency, index) => renderCircularRow(dependency, index)).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="display:flex; gap:8px; justify-content:flex-end; margin: 8px 0;">
      <button id="cycleZoomIn" style="padding:6px 10px; border:1px solid #e5e7eb; background:#fff; border-radius:6px; cursor:pointer;">+</button>
      <button id="cycleZoomOut" style="padding:6px 10px; border:1px solid #e5e7eb; background:#fff; border-radius:6px; cursor:pointer;">-</button>
      <button id="cycleZoomReset" style="padding:6px 10px; border:1px solid #e5e7eb; background:#fff; border-radius:6px; cursor:pointer;">Reset</button>
    </div>
    <div class="diagram" style="overflow: auto;">
      <div id="cycleMermaid" class="mermaid" style="transform-origin: 0 0;">${mermaid}</div>
    </div>
    <script>
      (function(){
        const target = document.getElementById('cycleMermaid');
        const zoomIn = document.getElementById('cycleZoomIn');
        const zoomOut = document.getElementById('cycleZoomOut');
        const zoomReset = document.getElementById('cycleZoomReset');
        if (!target || !zoomIn || !zoomOut || !zoomReset) return;

        let scale = 1;
        const applyScale = () => {
          target.style.transform = 'scale(' + scale.toFixed(2) + ')';
        };

        zoomIn.addEventListener('click', () => {
          scale = Math.min(scale + 0.1, 3);
          applyScale();
        });

        zoomOut.addEventListener('click', () => {
          scale = Math.max(scale - 0.1, 0.3);
          applyScale();
        });

        zoomReset.addEventListener('click', () => {
          scale = 1;
          applyScale();
        });
      })();
    </script>
    <div class="box" style="border-left-color: var(--success)">
      <h3>循環依存の分析</h3>
      <ul style="padding-left:18px; margin-top:8px;">
        <li>${result.circularDependencies.length}個の循環依存が検出されました</li>
        <li>${complexCycles.length}個の複雑な循環依存（長さ5以上）が存在します</li>
        <li>${simpleCycles.length}個は単純な相互参照（長さ2以下）です</li>
        ${longest.length ? `<li>最長循環: ${longestSummary}</li>` : ''}
      </ul>
    </div>
  </section>`;
}

export function generateD3DependencyGraphSection(result: AnalysisResult): string {
  if (!result.files) return '';
  const graph = buildD3DependencyGraph(result.files.typescript, result.files.php);
  if (graph.nodes.length === 0) {
    return '<section><h2>クラス依存グラフ (D3.js)</h2><div class="box">依存データがありません</div></section>';
  }
  return `
  <section>
    <h2>クラス依存グラフ (D3.js)</h2>
    <div class="box">${graph.links.length === 0 ? NO_CLASS_LINKS_NOTE : ''}${generateD3VisualizationScript(graph)}</div>
  </section>`;
}

function renderCircularRow(dependency: AnalysisResult['circularDependencies'][number], index: number): string {
  const category = getCycleCategory(dependency.length);
  const categoryStyle = getCycleCategoryStyle(category);
  return `<tr style="border-bottom: 1px solid #e5e7eb;">
    <td style="padding: 12px; color: #374151; font-weight: 600;">Cycle ${index + 1}</td>
    <td style="padding: 12px; color: #374151; text-align: center;">${dependency.length}</td>
    <td style="padding: 12px; color: #6b7280; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;">${dependency.cycle.join(' → ')}</td>
    <td style="padding: 12px; text-align: center;"><span style="${categoryStyle} padding: 4px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600;">${category}</span></td>
  </tr>`;
}

function getCycleCategory(length: number): string {
  if (length >= 5) return '複雑';
  if (length <= 2) return '単純';
  return '中程度';
}

function getCycleCategoryStyle(category: string): string {
  if (category === '複雑') return 'background:#fee2e2;color:#991b1b;';
  if (category === '単純') return 'background:#dcfce7;color:#166534;';
  return 'background:#fef3c7;color:#92400e;';
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

