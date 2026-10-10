import { secureWebviewHtml } from './webviewSecurity';
import { upgradeReportLibraries } from './reports/libraries';
import { injectReportBranding } from './reports/branding';
import { hasIncompleteAstMarkup } from './reports/integrity';
import { injectReportTabs } from './reportTabs';
import { injectReviewCopy } from './reportCopy';
import { translator } from './i18n';
import fs from 'node:fs';
import { getReportOpenMode } from './config';

/**
 * @param vscode The vscode API module.
 * @param reportPath Absolute local filesystem path to the generated HTML report.
 * @param analysisId Analysis ID, used only for the panel title.
 */
export async function openReport(vscode: typeof import('vscode'), reportPath: string, analysisId: string) {
  const originalHtml = fs.readFileSync(reportPath, 'utf-8');
  if (hasIncompleteAstMarkup(originalHtml)) {
    vscode.window.showErrorMessage(translator(vscode)('This saved report has incomplete AST markup. Run "Analyze Current Workspace" to regenerate it. The original report and saved reviews have been kept.'));
    return;
  }
  const enhancedHtml = injectReportBranding(injectReportTabs(injectReviewCopy(upgradeReportLibraries(originalHtml))));
  const reportUri = vscode.Uri.file(reportPath);
  const mode = getReportOpenMode(vscode);

  if (mode === 'vscode') {
    if (enhancedHtml !== originalHtml) fs.writeFileSync(reportPath, enhancedHtml, 'utf-8');
    await vscode.commands.executeCommand('vscode.open', reportUri);
    return;
  }

  if (mode === 'external') {
    if (enhancedHtml !== originalHtml) fs.writeFileSync(reportPath, enhancedHtml, 'utf-8');
    await vscode.env.openExternal(reportUri);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'codeDoctorReport',
    translator(vscode)('Codes Doctor Report: {analysisId}', { analysisId }),
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      localResourceRoots: [],
    }
  );

  panel.webview.onDidReceiveMessage(async (input: unknown) => {
    if (!input || typeof input !== 'object') return;
    const message = input as Record<string, unknown>;
    if (message?.type !== 'copyReview' || typeof message.id !== 'string' || !['llmResult', 'astResult', 'llmAgentPrompt'].includes(message.id) || typeof message.text !== 'string') return;
    let ok = true;
    try { await vscode.env.clipboard.writeText(message.text); } catch { ok = false; }
    await panel.webview.postMessage({ type: 'reviewCopied', id: message.id, ok });
  });
  const reportHtml = enhancedHtml;
  panel.webview.html = secureWebviewHtml(reportHtml, panel.webview.cspSource);
}

module.exports = {
  openReport,
};
