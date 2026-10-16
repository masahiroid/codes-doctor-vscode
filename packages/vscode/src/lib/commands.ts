import { translator } from './i18n';
import fs from 'node:fs';
import path from 'node:path';
import { openReport } from './reportViewer';
import { analyzeWorkspace, getDefaultOutputDir } from './analyzer';
import {
  getAnalysisLanguage,
  getLlmProvider,
  getDisplayLanguage,
  getMinSecurity,
  getMinTechnicalDebt,
  getCustomOutputDir,
} from './config';
import { setApiKey } from './secrets';
import { setLastAnalysis, getLastAnalysis } from './lastAnalysisState';
import { summarize, formatSummary } from './summary';
import { updateDiagnostics } from './diagnostics';
import { applyIgnoreComments } from './ignoreComments';
import { getGitChangedFiles, filterResultByChangedFiles } from './gitDiff';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

export function createCommands(
  vscode: typeof import('vscode'),
  context: import('vscode').ExtensionContext,
  diagnosticCollection?: import('vscode').DiagnosticCollection
) {
  const t = translator(vscode);

  async function pickWorkspaceFolder() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage(t("No workspace folder is open. Open a folder and try again."));
      return undefined;
    }

    if (folders.length === 1) return folders[0];

    const picked = await vscode.window.showQuickPick(
      folders.map((folder: import('vscode').WorkspaceFolder) => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder,
      })),
      {
        title: t("Select Workspace Folder for Codes Doctor Analysis"),
      }
    );
    return picked?.folder;
  }

  async function analyzeCurrentWorkspace() {
    const targetFolder = await pickWorkspaceFolder();
    if (!targetFolder) return;

    const language = getAnalysisLanguage(vscode);

    await Promise.resolve(vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t("Codes Doctor analysis running"),
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });

        const customDir = getCustomOutputDir(vscode);
        const outputDir = customDir
          ? (path.isAbsolute(customDir) ? customDir : path.resolve(targetFolder.uri.fsPath, customDir))
          : getDefaultOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });

        const analysis = await analyzeWorkspace(targetFolder.uri.fsPath, language, outputDir, getDisplayLanguage(vscode));
        const filteredResult = applyIgnoreComments(analysis.result);
        const minSecurity = getMinSecurity(vscode);
        const minTechnicalDebt = getMinTechnicalDebt(vscode);
        const summary = summarize(filteredResult, analysis.reportPath, { minSecurity, minTechnicalDebt });
        setLastAnalysis(analysis.analysisId, outputDir, analysis.reportPath, summary, filteredResult);
        updateDiagnostics(vscode, diagnosticCollection, filteredResult);

        progress.report({ message: t("Opening report...") });
        await openReport(vscode, analysis.reportPath, analysis.analysisId);

        const openText = t('Open Report');
        const copyText = t('Copy Summary');

        if (summary.failures.length > 0) {
          const failures = summary.failures.join(', ');
          vscode.window
            .showWarningMessage(t('Quality gate failed: {failures}', { failures }), openText, copyText)
            .then(async (action) => {
              if (action === openText) await openReport(vscode, analysis.reportPath, analysis.analysisId);
              else if (action === copyText) {
                await vscode.env.clipboard.writeText(formatSummary(summary));
                vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
              }
            });
        } else {
          const sec = summary.security ? `${summary.security.score}/100` : 'N/A';
          const debt = summary.technicalDebt ? `${summary.technicalDebt.score}/100` : 'N/A';
          const summaryStr = `Security: ${sec}, Debt: ${debt}`;
          vscode.window
            .showInformationMessage(t('Codes Doctor analysis ready ({summary})', { summary: summaryStr }), openText, copyText)
            .then(async (action) => {
              if (action === openText) await openReport(vscode, analysis.reportPath, analysis.analysisId);
              else if (action === copyText) {
                await vscode.env.clipboard.writeText(formatSummary(summary));
                vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
              }
            });
        }
      }
    )).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
    });
  }

  async function analyzeGitChanges() {
    const targetFolder = await pickWorkspaceFolder();
    if (!targetFolder) return;

    let changedFiles: string[];
    try {
      changedFiles = getGitChangedFiles(targetFolder.uri.fsPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('Could not inspect Git changes: {message}', { message }));
      return;
    }

    if (changedFiles.length === 0) {
      vscode.window.showInformationMessage(t('No changed files detected in Git.'));
      return;
    }

    const language = getAnalysisLanguage(vscode);

    await Promise.resolve(vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t("Codes Doctor analysis running"),
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });

        const customDir = getCustomOutputDir(vscode);
        const outputDir = customDir
          ? (path.isAbsolute(customDir) ? customDir : path.resolve(targetFolder.uri.fsPath, customDir))
          : getDefaultOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });

        const analysis = await analyzeWorkspace(targetFolder.uri.fsPath, language, outputDir, getDisplayLanguage(vscode));
        const ignoredFiltered = applyIgnoreComments(analysis.result);
        const diffFiltered = filterResultByChangedFiles(ignoredFiltered, changedFiles);

        const minSecurity = getMinSecurity(vscode);
        const minTechnicalDebt = getMinTechnicalDebt(vscode);
        const summary = summarize(diffFiltered, analysis.reportPath, { minSecurity, minTechnicalDebt });
        setLastAnalysis(analysis.analysisId, outputDir, analysis.reportPath, summary, diffFiltered);
        updateDiagnostics(vscode, diagnosticCollection, diffFiltered);

        const openText = t('Open Report');
        const copyText = t('Copy Summary');

        if (summary.failures.length > 0) {
          const failures = summary.failures.join(', ');
          vscode.window
            .showWarningMessage(t('Quality gate failed: {failures}', { failures }), openText, copyText)
            .then(async (action) => {
              if (action === openText) await openReport(vscode, analysis.reportPath, analysis.analysisId);
              else if (action === copyText) {
                await vscode.env.clipboard.writeText(formatSummary(summary));
                vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
              }
            });
        } else {
          const secIssues = (diffFiltered.securityScore?.issues || []).filter((i) => i.type !== 'info').length;
          const gcCount = (diffFiltered.godClasses || []).length;
          const summaryStr = `Issues: ${secIssues}, God Classes: ${gcCount}`;
          vscode.window
            .showInformationMessage(
              t('Git changes analysis ready ({count} changed files, {summary})', {
                count: changedFiles.length,
                summary: summaryStr,
              }),
              openText,
              copyText
            )
            .then(async (action) => {
              if (action === openText) await openReport(vscode, analysis.reportPath, analysis.analysisId);
              else if (action === copyText) {
                await vscode.env.clipboard.writeText(formatSummary(summary));
                vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
              }
            });
        }
      }
    )).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
    });
  }

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
    const provider = getLlmProvider(vscode);
    const providerLabel = PROVIDER_LABELS[provider] || provider;

    const apiKey = await vscode.window.showInputBox({
      title: t('Set {provider} API Key', { provider: providerLabel }),
      prompt: t("Enter your {provider} API key. It is stored securely in VS Code's secret storage (not in settings.json).", { provider: providerLabel }),
      password: true,
      ignoreFocusOut: true,
      placeHolder: provider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
    });

    if (apiKey === undefined) {
      return;
    }

    await setApiKey(context, provider, apiKey.trim());
    if (apiKey.trim()) {
      vscode.window.showInformationMessage(t('{provider} API key saved.', { provider: providerLabel }));
    } else {
      vscode.window.showInformationMessage(t('{provider} API key cleared.', { provider: providerLabel }));
    }
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
  };
}

module.exports = {
  createCommands,
};

