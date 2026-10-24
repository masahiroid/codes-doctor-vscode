import { translator } from './i18n';
import { openReport } from './reportViewer';
import { getLastAnalysis } from './lastAnalysisState';
import { formatSummary } from './summary';
import { previewAndApplyAiFix, type AiFixOptions } from './aiFixPreview';
import { createWorkspaceAnalysisCommands } from './workspaceAnalysisCommands';
import { promptForLlmApiKey } from './apiKeyCommand';

/**
 * The extension's command handlers. Analysis runs and API key setup live in their own modules;
 * this keeps the small commands that work on the last analysis and the editor.
 */
export function createCommands(
  vscode: typeof import('vscode'),
  context: import('vscode').ExtensionContext,
  diagnosticCollection?: import('vscode').DiagnosticCollection
) {
  const t = translator(vscode);

  const { analyzeCurrentWorkspace, analyzeGitChanges } = createWorkspaceAnalysisCommands(vscode, context, diagnosticCollection);

  async function copySummary() {
    const last = getLastAnalysis();
    if (!last || !last.summary) {
      vscode.window.showWarningMessage(t('No analysis results available yet. Run "Analyze Current Workspace" first.'));
      return;
    }
    await vscode.env.clipboard.writeText(formatSummary(last.summary));
    vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
  }

  async function copySummaryJson() {
    const last = getLastAnalysis();
    if (!last || !last.summary) {
      vscode.window.showWarningMessage(t('No analysis results available yet. Run "Analyze Current Workspace" first.'));
      return;
    }
    await vscode.env.clipboard.writeText(JSON.stringify(last.summary, null, 2));
    vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
  }

  async function openLastReport() {
    const last = getLastAnalysis();
    if (!last || !last.reportPath) {
      vscode.window.showWarningMessage(t('No analysis results available yet. Run "Analyze Current Workspace" first.'));
      return;
    }
    await openReport(vscode, last.reportPath, last.analysisId);
  }

  async function clearDiagnostics() {
    diagnosticCollection?.clear();
    vscode.window.showInformationMessage(t('Editor diagnostics cleared.'));
  }

  async function openFindingLocation(filePath?: string, lineOneBased?: number) {
    if (!filePath || typeof filePath !== 'string') return;
    const uri = vscode.Uri.file(filePath);
    const lineIdx = typeof lineOneBased === 'number' && lineOneBased > 0 ? lineOneBased - 1 : 0;
    const range = new vscode.Range(lineIdx, 0, lineIdx, 0);
    await vscode.window.showTextDocument(uri, { selection: range });
  }

  async function setLlmApiKey() {
    return promptForLlmApiKey(vscode, context);
  }

  async function previewAiFix(options?: AiFixOptions) {
    return previewAndApplyAiFix(vscode, context, options);
  }

  return {
    analyzeCurrentWorkspace,
    analyzeGitChanges,
    setLlmApiKey,
    copySummary,
    copySummaryJson,
    openLastReport,
    clearDiagnostics,
    openFindingLocation,
    previewAiFix,
  };
}

module.exports = {
  createCommands,
};

