import type { AnalysisResult } from '../types';
import path from 'node:path';
import { persistHtmlReport } from './output';
import { readSavedReviews } from '../llm/artifacts';
import { renderTabNav, renderTabPanels } from './sections';
import { escapeHtml } from '../html';
import { reportLibraryScript } from './browser/libraries';
import { installReportTabs, TAB_SCRIPT_ID } from './browser/reportTabs';
import { reviewCopySource } from './browser/reviewCopy';
import { installJapaneseStrong } from './browser/markdown';
import { PRODUCT_NAME } from './branding';

/**
 * Browser scripts carry text for both report languages and pick one from `<html lang>`.
 * Their CJK characters are written as `\u` escapes so an English report contains no
 * Japanese text, while the script still shows Japanese in a Japanese report.
 */
function asciiScript(code: string): string {
  return code.replace(/[\u3000-\u9fff\uff01-\uffef]/g, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}

export interface ReportOptions {
  /** Version of the tool that generated the report, recorded in a `<meta>` tag. */
  generatorVersion?: string;
}

export async function generateHTMLReport(result: AnalysisResult, outputPath: string, options: ReportOptions = {}): Promise<void> {
  const repoName = escapeHtml(path.basename(result.repoPath));
  const generatorMeta = options.generatorVersion
    ? `<meta name="codes-doctor-version" content="${escapeHtml(options.generatorVersion)}" />`
    : '';
  // Runs before Markdown rendering so copy buttons keep the original Markdown source.
  const markdownSetup = asciiScript(`if (typeof marked !== 'undefined') { (${installJapaneseStrong.toString()})(marked); }\n(${reviewCopySource()})();`);
  const outputDir = path.dirname(outputPath);
  const savedReviews = readSavedReviews(result.analysisId, outputDir);

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />${generatorMeta}
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${PRODUCT_NAME} — ${repoName}</title>
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
      .tab-nav { display: none !important; }
      .tab-panel { display: block !important; }
      h2, h3 { page-break-after: avoid; }
      .card, .box, table, .diagram, tr, li { page-break-inside: avoid; break-inside: avoid; }
      section { page-break-inside: avoid; break-inside: avoid; margin-bottom: 14px; }
    }
  </style>
  ${reportLibraryScript('chart')}
  ${reportLibraryScript('mermaid')}
  ${reportLibraryScript('marked')}
</head>
<body data-analysis-id="${result.analysisId}">
  <div class="container">
    <header>
      <div class="header-top">
        <h1>${PRODUCT_NAME}</h1>
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
    <footer>Generated by ${PRODUCT_NAME} — ${new Date().toLocaleString('ja-JP')}</footer>
  </div>
  <script>
    if (typeof mermaid !== 'undefined') mermaid.initialize({ startOnLoad: false, theme: 'default' });
    ${markdownSetup}
    // Render initial saved Markdown results
    document.querySelectorAll('[data-md]').forEach(function(el) {
      var md = el.getAttribute('data-md');
      if (md && typeof marked !== 'undefined') {
        el.innerHTML = marked.parse(md);
        el.removeAttribute('data-md');
      }
    });
  </script>
  <script id="${TAB_SCRIPT_ID}">(${installReportTabs.toString()})();</script>
</body>
</html>`;

  persistHtmlReport(result, outputPath, html);
}
