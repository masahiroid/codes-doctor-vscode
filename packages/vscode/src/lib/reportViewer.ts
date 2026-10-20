import { secureWebviewHtml } from './webviewSecurity';
import { upgradeReportLibraries } from './reports/libraries';
import { injectReportBranding } from './reports/branding';
import { hasIncompleteAstMarkup } from './reports/integrity';
import { injectReportTabs, injectReviewCopy, injectTableFilter, isReviewTargetId } from './reportScripts';
import { translator } from './i18n';
import fs from 'node:fs';
import { getReportOpenMode } from './config';

/**
 * @param vscode The vscode API module.
 * @param reportPath Absolute local filesystem path to the generated HTML report.
 * @param analysisId Analysis ID, used only for the panel title.
 */
export async function openReport(vscode: typeof import('vscode'), reportPath: string, analysisId: string) {
  try {
    const reportUri = vscode.Uri.file(reportPath);
    const mode = getReportOpenMode(vscode);
    // Reports already contain their browser assets. Do not load or rewrite them in
    // the extension host just to hand the file to another application.
    const stat = await fs.promises.stat(reportPath);
    if (mode === 'external' || (mode !== 'vscode' && stat.size > 16 * 1024 * 1024)) {
      if (!await vscode.env.openExternal(reportUri)) {
        throw new Error(`Could not open report in the default browser: ${reportPath}`);
      }
      return;
    }
    if (mode === 'vscode') {
      await vscode.commands.executeCommand('vscode.open', reportUri);
      return;
    }
    const originalHtml = await fs.promises.readFile(reportPath, 'utf-8');
    if (hasIncompleteAstMarkup(originalHtml)) {
      vscode.window.showErrorMessage(translator(vscode)('This saved report has incomplete AST markup. Run "Analyze Current Workspace" to regenerate it. The original report and saved reviews have been kept.'));
      return;
    }
    const enhancedHtml = injectReportBranding(injectReportTabs(injectTableFilter(injectReviewCopy(upgradeReportLibraries(originalHtml)))));
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
      if (message?.type !== 'copyReview' || !isReviewTargetId(message.id) || typeof message.text !== 'string') return;
      let ok = true;
      try { await vscode.env.clipboard.writeText(message.text); } catch { ok = false; }
      await panel.webview.postMessage({ type: 'reviewCopied', id: message.id, ok });
    });
    const reportHtml = enhancedHtml;
    panel.webview.html = secureWebviewHtml(reportHtml, panel.webview.cspSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(translator(vscode)('Failed to open report: {message}', { message }));
  }
}

module.exports = {
  openReport,
};
