const fs = require('node:fs');
const { getReportOpenMode } = require('./config');

/**
 * CDN hosts the generated report HTML loads scripts from (Chart.js, Mermaid,
 * marked, D3) — see src/report/htmlBuilder.ts and src/graph/d3/visualizationScript.ts
 * in the CSAP repo. Kept in sync manually since the report HTML is vendored,
 * not imported as data.
 */
const REPORT_SCRIPT_SOURCES = ['https://cdn.jsdelivr.net', 'https://d3js.org'];

function buildContentSecurityPolicy(webview) {
  const scriptSrc = ['\'unsafe-inline\'', webview.cspSource, ...REPORT_SCRIPT_SOURCES].join(' ');
  const styleSrc = ['\'unsafe-inline\'', webview.cspSource].join(' ');
  return [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `font-src ${webview.cspSource} https:`,
    `connect-src https:`,
  ].join('; ');
}

/**
 * Inject a <meta http-equiv="Content-Security-Policy"> tag right after <head>,
 * so the already-rendered report HTML (vendored, not templated here) can load
 * its CDN scripts and run its inline <script> blocks inside the webview.
 */
function injectCsp(html, csp) {
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (match) => `${match}\n${metaTag}`);
  }
  // No <head> tag found (unexpected for a generated report) — prepend defensively.
  return `${metaTag}\n${html}`;
}

/**
 * @param vscode The vscode API module.
 * @param reportPath Absolute local filesystem path to the generated HTML report.
 * @param analysisId Analysis ID, used only for the panel title.
 */
async function openReport(vscode, reportPath, analysisId) {
  const reportUri = vscode.Uri.file(reportPath);
  const mode = getReportOpenMode(vscode);

  if (mode === 'vscode') {
    await vscode.commands.executeCommand('vscode.open', reportUri);
    return;
  }

  if (mode === 'external') {
    await vscode.env.openExternal(reportUri);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'codeDoctorReport',
    `Codes Doctor Report: ${analysisId}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
    }
  );

  const reportHtml = fs.readFileSync(reportPath, 'utf-8');
  const csp = buildContentSecurityPolicy(panel.webview);
  panel.webview.html = injectCsp(reportHtml, csp);
}

module.exports = {
  openReport,
};
