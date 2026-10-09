import { buildD3DependencyGraph, generateD3VisualizationScript } from '../../graph/d3Graph';
import type { AnalysisResult } from '../../types';
import { escapeHtml } from '../../html';
import { CYCLE_LENGTH_THRESHOLDS } from '../../analyzer/technicalDebt';
import { buildLlmControlsHtml, buildLlmControlsScript } from './llmControls';

const LONGEST_CYCLES_DISPLAY_LIMIT = 2;
const CYCLE_PATH_PREVIEW_LENGTH = 3;

export function mermaidSection(title: string, graphText: string): string {
  return `
  <section>
    <h2>${title}</h2>
    <div class="diagram"><div class="mermaid">${graphText}</div></div>
  </section>`;
}

const LLM_DEFAULT_TOKENS = 3000;

export function llmSection(result: AnalysisResult, savedResult?: string): string {
  const enabled = result.config.features.llm;
  const analysisId = result.analysisId;
  const focus = 'architecture-review';
  const disabledNote = enabled ? '' : 'LLM分析は無効です。CSAP_LLM_ENABLED=true と API キーを設定してください。';
  const initialContent = savedResult ? escapeHtml(savedResult) : '未実行';
  const initialDataMd = savedResult ? escapeHtml(savedResult) : '';
  const initialStatus = savedResult ? 'レポート生成時の保存済み結果' : disabledNote;

  return `
  <section id="sec-llm">
    <h2>LLM構造解析</h2>
    <div class="box">
      ${buildLlmControlsHtml({
        idPrefix: 'llm',
        defaultTokens: LLM_DEFAULT_TOKENS,
        enabled,
        buttonLabel: '構造レビュー (再実行)',
      })}
      <div id="llmStatusInit" style="display:none;">${initialStatus}</div>
      <div style="margin: 10px 0; color:#6b7280; font-size:0.88em;">
        構造レビューは、モジュール依存グラフ・関数呼び出しグラフ・God Class分布をまとめて解釈し、このままで良いのか、優先改善が必要かを判断します。
      </div>
      <div id="llmResult" class="llm-result" data-md="${initialDataMd}">${initialContent}</div>
    </div>
    <script>
      (function(){
        const enabled = ${enabled ? 'true' : 'false'};
        const analysisId = "${analysisId}";
        const focus = "${focus}";
        const astOnlyMode = false;
        const defaultTokens = ${LLM_DEFAULT_TOKENS};
        const statusEl = document.getElementById('llmStatus');
        const resultEl = document.getElementById('llmResult');
        const initialStatusEl = document.getElementById('llmStatusInit');
        if (statusEl && initialStatusEl) statusEl.textContent = initialStatusEl.textContent;

        async function loadSavedResult() {
          try {
            const response = await fetch('/api/llm/result/' + encodeURIComponent(analysisId) + '/' + encodeURIComponent(focus));
            if (!response.ok) return;
            const data = await response.json();
            if (!data.success || !data.result) return;
            resultEl.innerHTML = typeof marked !== 'undefined' ? marked.parse(data.result) : data.result;
            statusEl.textContent = data.createdAt ? '保存済み結果を表示' : '保存済み結果';
          } catch (_error) {}
        }

        ${buildLlmControlsScript('llm')}

        loadSavedResult();
      })();
    </script>
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
  if (!result.tsFiles || !result.phpFiles) return '';
  const graph = buildD3DependencyGraph(result.tsFiles, result.phpFiles);
  if (graph.nodes.length === 0) {
    return '<section><h2>クラス依存グラフ (D3.js)</h2><div class="box">依存データがありません</div></section>';
  }
  return `
  <section>
    <h2>クラス依存グラフ (D3.js)</h2>
    <div class="box">${generateD3VisualizationScript(graph)}</div>
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
  const maxEdges = 80;

  for (const cycle of cycles) {
    const cyclePath = cycle.cycle.length > 1 ? cycle.cycle : [];
    for (let index = 0; index < cyclePath.length - 1; index += 1) {
      const from = cyclePath[index];
      const to = cyclePath[index + 1];
      edgeSet.add(`${from}-->${to}`);
    }
  }

  const edges = Array.from(edgeSet).slice(0, maxEdges);
  const lines = ['graph LR'];

  for (const edge of edges) {
    const [from, to] = edge.split('-->');
    const fromId = toMermaidNodeId(from);
    const toId = toMermaidNodeId(to);
    lines.push(`  ${fromId}["${escapeMermaidLabel(from)}"] --> ${toId}["${escapeMermaidLabel(to)}"]`);
  }

  if (edgeSet.size > maxEdges) {
    lines.push(`  note["Showing ${maxEdges} of ${edgeSet.size} cycle edges"]`);
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
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ (value.codePointAt(index) || 0);
  }
  return (hash >>> 0).toString(36);
}

