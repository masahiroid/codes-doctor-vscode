import fs from 'node:fs';
import path from 'node:path';
import { translator } from './i18n';
import { openReport } from './reportViewer';
import { analyzeWorkspace, getDefaultOutputDir } from './analyzer';
import {
  getAnalysisLanguage,
  getDisplayLanguage,
  getMinSecurity,
  getMinTechnicalDebt,
  getCustomOutputDir,
} from './config';
import { setLastAnalysis } from './lastAnalysisState';
import { summarize, formatSummary } from './summary';
import { updateDiagnostics } from './diagnostics';
import { applyIgnoreComments } from './ignoreComments';
import { getGitChangedFiles, filterResultByChangedFiles } from './gitDiff';
import type { AnalysisResult } from './engine';

/**
 * The two commands that run a workspace analysis: the whole workspace, or only the files changed
 * in Git. Both pick the folder, write the report, record the result for the other commands, update
 * editor diagnostics and offer to open the report or copy the summary.
 */
export function createWorkspaceAnalysisCommands(
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

  /** The configured output folder (relative paths are inside the workspace folder), created if needed. */
  function outputDirFor(folder: import('vscode').WorkspaceFolder) {
    const customDir = getCustomOutputDir(vscode);
    const outputDir = customDir
      ? (path.isAbsolute(customDir) ? customDir : path.resolve(folder.uri.fsPath, customDir))
      : getDefaultOutputDir(context);
    fs.mkdirSync(outputDir, { recursive: true });
    return outputDir;
  }

  /**
   * Analyze the folder, narrow the result (ignore comments, then the caller's filter), and make it
   * the current analysis: summary with quality gates, last-analysis state and editor diagnostics.
   */
  async function runAnalysis(folder: import('vscode').WorkspaceFolder, language: string, narrow: (result: AnalysisResult) => AnalysisResult = (result) => result) {
    const outputDir = outputDirFor(folder);
    const analysis = await analyzeWorkspace(folder.uri.fsPath, language, outputDir, getDisplayLanguage(vscode));
    const result = narrow(applyIgnoreComments(analysis.result));
    const minSecurity = getMinSecurity(vscode);
    const minTechnicalDebt = getMinTechnicalDebt(vscode);
    const summary = summarize(result, analysis.reportPath, { minSecurity, minTechnicalDebt });
    setLastAnalysis(analysis.analysisId, outputDir, analysis.reportPath, summary, result);
    updateDiagnostics(vscode, diagnosticCollection, result);
    return { analysis, result, summary };
  }

  /** A failed quality gate as a warning, otherwise `readyMessage`; either offers to open the report or copy the summary. */
  function announce(analysis: { reportPath: string; analysisId: string }, summary: ReturnType<typeof summarize>, readyMessage: () => string) {
    const openText = t('Open Report');
    const copyText = t('Copy Summary');
    const shown = summary.failures.length > 0
      ? vscode.window.showWarningMessage(t('Quality gate failed: {failures}', { failures: summary.failures.join(', ') }), openText, copyText)
      : vscode.window.showInformationMessage(readyMessage(), openText, copyText);
    shown.then(async (action) => {
      if (action === openText) await openReport(vscode, analysis.reportPath, analysis.analysisId);
      else if (action === copyText) {
        await vscode.env.clipboard.writeText(formatSummary(summary));
        vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
      }
    });
  }

  /** Run `task` under the analysis progress notification; any failure becomes one error message. */
  async function withAnalysisProgress(task: (progress: { report(value: { message?: string }): void }) => Promise<void>) {
    await Promise.resolve(vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t("Codes Doctor analysis running"),
        cancellable: false,
      },
      task
    )).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
    });
  }

  async function analyzeCurrentWorkspace() {
    const targetFolder = await pickWorkspaceFolder();
    if (!targetFolder) return;

    const language = getAnalysisLanguage(vscode);

    await withAnalysisProgress(async (progress) => {
      progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });
      const { analysis, summary } = await runAnalysis(targetFolder, language);

      progress.report({ message: t("Opening report...") });
      await openReport(vscode, analysis.reportPath, analysis.analysisId);

      announce(analysis, summary, () => {
        const sec = summary.security ? `${summary.security.score}/100` : 'N/A';
        const debt = summary.technicalDebt ? `${summary.technicalDebt.score}/100` : 'N/A';
        const summaryStr = `Security: ${sec}, Debt: ${debt}`;
        return t('Codes Doctor analysis ready ({summary})', { summary: summaryStr });
      });
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

    await withAnalysisProgress(async (progress) => {
      progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });
      const { analysis, result, summary } = await runAnalysis(targetFolder, language, (ignored) => filterResultByChangedFiles(ignored, changedFiles));

      announce(analysis, summary, () => {
        const secIssues = (result.securityScore?.issues || []).filter((i) => i.type !== 'info').length;
        const gcCount = (result.godClasses || []).length;
        const summaryStr = `Issues: ${secIssues}, God Classes: ${gcCount}`;
        return t('Git changes analysis ready ({count} changed files, {summary})', {
          count: changedFiles.length,
          summary: summaryStr,
        });
      });
    });
  }

  return { analyzeCurrentWorkspace, analyzeGitChanges };
}

module.exports = {
  createWorkspaceAnalysisCommands,
};
