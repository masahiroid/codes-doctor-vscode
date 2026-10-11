import type { AnalysisResult } from '../types';
import path from 'node:path';
import { persistHtmlReport } from './output';
import { readSavedReviews } from '../llm/artifacts';
import { renderTabNav, renderTabPanels } from './sections';

export async function generateHTMLReport(result: AnalysisResult, outputPath: string): Promise<void> {
  const repoName = path.basename(result.repoPath);
  const outputDir = path.dirname(outputPath);
  const savedReviews = readSavedReviews(result.analysisId, outputDir);

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Code Doctor レポート — ${repoName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #2563eb;
      --success: #059669;
      --warning: #d97706;
      --danger: #dc2626;
      --dark: #111827;
      --muted: #6b7280;
      --bg: #f3f4f6;
      --border: #e5e7eb;
      --white: #fff;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--dark); line-height: 1.6; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; background: var(--white); border-radius: 8px; border: 1px solid var(--border); overflow: hidden; }
    header { padding: 24px 28px; border-bottom: 1px solid var(--border); }
    .header-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .actions { display: flex; gap: 10px; }
    .btn { display: inline-block; padding: 8px 14px; border-radius: 6px; text-decoration: none; color: #fff; background: var(--primary); font-weight: 600; font-size: 0.9rem; }
    .btn.pdf { background: var(--success); }
    .meta { margin-top: 10px; color: var(--muted); font-size: 0.9rem; }
    /* ---- Tab Navigation ---- */
    .tab-nav { display: flex; flex-wrap: wrap; gap: 4px; padding: 12px 28px 0; background: var(--bg); border-bottom: 2px solid var(--border); position: sticky; top: 0; z-index: 100; }
    .tab-btn { padding: 8px 16px; border: 1px solid var(--border); border-bottom: none; border-radius: 6px 6px 0 0; background: #fff; cursor: pointer; font-size: 0.88rem; color: var(--muted); transition: background 0.15s, color 0.15s; }
    .tab-btn:hover { background: #eff6ff; color: var(--primary); }
    .tab-btn.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    main { padding: 28px; }
    h2 { margin: 28px 0 14px; border-bottom: 2px solid var(--border); padding-bottom: 8px; }
    h3 { margin: 18px 0 10px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px; }
    .card { border: 1px solid var(--border); border-radius: 8px; padding: 16px; background: #fff; }
    .card .label { color: var(--muted); font-size: 0.82rem; text-transform: uppercase; }
    .card .value { font-size: 2rem; font-weight: 700; margin-top: 4px; }
    .box { border: 1px solid var(--border); border-left: 4px solid var(--primary); border-radius: 8px; padding: 14px; margin: 14px 0; background: #fff; }
    .warn { border-left-color: var(--warning); background: #fef3c7; }
    table { width: 100%; border-collapse: collapse; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    th, td { border-bottom: 1px solid var(--border); padding: 10px 12px; text-align: left; font-size: 0.9rem; }
    th { background: #f9fafb; }
    .diagram { border: 1px solid var(--border); border-left: 4px solid var(--primary); border-radius: 8px; padding: 12px; min-height: 220px; overflow-x: auto; }
    .llm-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 12px; }
    .llm-controls button { width: auto; padding: 10px 14px; margin-top: 0; }
    .llm-result { background: #f9fafb; border: 1px solid var(--border); border-radius: 6px; padding: 12px; white-space: normal; min-height: 120px; line-height: 1.7; }
    .llm-result p { margin: 0 0 10px; }
    .llm-result ul, .llm-result ol { padding-left: 20px; margin: 0 0 10px; }
    .llm-result h1, .llm-result h2, .llm-result h3 { margin: 14px 0 6px; }
    .llm-result code { background: #e5e7eb; padding: 2px 5px; border-radius: 3px; font-size: 0.88em; }
    .llm-result pre code { background: none; padding: 0; }
    footer { padding: 16px 28px; color: var(--muted); border-top: 1px solid var(--border); font-size: 0.85rem; }

    @media print {
      body { background: #fff; padding: 0; }
      .container { border: none; }
      .btn, .tab-nav { display: none !important; }
      .tab-panel { display: block !important; }
      h2, h3 { page-break-after: avoid; }
      .card, .box, table, .diagram, tr, li { page-break-inside: avoid; break-inside: avoid; }
      section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 14px; }
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked@12/marked.min.js"></script>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-top">
        <h1>Code Doctor コード構造監査レポート</h1>
        <div class="actions">
          <a class="btn" href="/">新しい分析を開始</a>
          <a class="btn pdf" href="/reports/${result.analysisId}/pdf">PDFダウンロード</a>
        </div>
      </div>
      <div class="meta">
        <div><strong>リポジトリ:</strong> ${repoName}</div>
        <div><strong>分析日時:</strong> ${new Date(result.analyzedAt).toLocaleString('ja-JP')}</div>
        <div><strong>主要言語:</strong> ${result.detectedLanguages.primaryLanguage}</div>
      </div>
    </header>
    <nav class="tab-nav" id="tabNav">
${renderTabNav()}
    </nav>
    <main>
${renderTabPanels(result, savedReviews)}
    </main>
    <footer>Generated by Code Doctor — ${new Date().toLocaleString('ja-JP')}</footer>
  </div>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    // Render initial saved Markdown results
    document.querySelectorAll('[data-md]').forEach(function(el) {
      var md = el.getAttribute('data-md');
      if (md && typeof marked !== 'undefined') {
        el.innerHTML = marked.parse(md);
        el.removeAttribute('data-md');
      }
    });
    (function(){
      const nav = document.getElementById('tabNav');
      if (!nav) return;
      const storageKey = 'csap-tab-${result.analysisId}';
      const saved = sessionStorage.getItem(storageKey);
      let mermaidRendered = false;

      function activateTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
          btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });
        document.querySelectorAll('.tab-panel').forEach(function(panel) {
          panel.classList.toggle('active', panel.id === 'tab-' + tabId);
        });
        sessionStorage.setItem(storageKey, tabId);
        // Run Mermaid the first time the graphs tab becomes visible
        if (tabId === 'graphs' && !mermaidRendered) {
          mermaidRendered = true;
          mermaid.run({ querySelector: '#tab-graphs .mermaid' });
        }
      }

      nav.addEventListener('click', function(e) {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        activateTab(btn.getAttribute('data-tab'));
      });

      const initTab = saved || 'overview';
      activateTab(initTab);
      // If landing on graphs tab directly, render mermaid now
      if (initTab === 'graphs') { mermaidRendered = true; mermaid.run({ querySelector: '#tab-graphs .mermaid' }); }
    })();
  </script>
</body>
</html>`;

  persistHtmlReport(result, outputPath, html);
}
