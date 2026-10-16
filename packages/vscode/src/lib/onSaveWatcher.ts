import fs from 'node:fs';
import path from 'node:path';
import { analyzeWorkspace, getDefaultOutputDir } from './analyzer';
import {
  getAnalysisLanguage,
  getDisplayLanguage,
  getMinSecurity,
  getMinTechnicalDebt,
  getCustomOutputDir,
  getAnalyzeOnSave,
} from './config';
import { getLastAnalysis, setLastAnalysis } from './lastAnalysisState';
import { updateDiagnostics } from './diagnostics';
import { applyIgnoreComments } from './ignoreComments';
import { summarize } from './summary';

export function createOnSaveController(
  vscode: typeof import('vscode'),
  context: import('vscode').ExtensionContext,
  diagnosticCollection?: import('vscode').DiagnosticCollection,
  debounceMs = 500
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  async function handleDocumentSaved(document: import('vscode').TextDocument) {
    if (!document?.uri?.fsPath) return;

    // 1. Immediately re-evaluate inline ignore comments against existing analysis results
    const current = getLastAnalysis();
    if (current?.result) {
      const filtered = applyIgnoreComments(current.result);
      const minSecurity = getMinSecurity(vscode);
      const minTechnicalDebt = getMinTechnicalDebt(vscode);
      const summary = summarize(filtered, current.reportPath || '', { minSecurity, minTechnicalDebt });
      setLastAnalysis(current.analysisId, current.outputDir, current.reportPath, summary, filtered);
      updateDiagnostics(vscode, diagnosticCollection, filtered);
    }

    // 2. If analyzeOnSave is enabled, run a quiet background workspace analysis
    if (!getAnalyzeOnSave(vscode)) return;

    const folders = vscode.workspace?.workspaceFolders;
    if (!folders || folders.length === 0) return;

    const savedPath = path.resolve(document.uri.fsPath);
    const targetFolder =
      folders.find((f) => savedPath.startsWith(path.resolve(f.uri.fsPath))) || folders[0];

    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) return;
      running = true;
      try {
        const customDir = getCustomOutputDir(vscode);
        const outputDir = customDir
          ? path.isAbsolute(customDir)
            ? customDir
            : path.resolve(targetFolder.uri.fsPath, customDir)
          : getDefaultOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });

        const analysis = await analyzeWorkspace(
          targetFolder.uri.fsPath,
          getAnalysisLanguage(vscode),
          outputDir,
          getDisplayLanguage(vscode)
        );
        const filtered = applyIgnoreComments(analysis.result);
        const minSecurity = getMinSecurity(vscode);
        const minTechnicalDebt = getMinTechnicalDebt(vscode);
        const summary = summarize(filtered, analysis.reportPath, { minSecurity, minTechnicalDebt });
        setLastAnalysis(analysis.analysisId, outputDir, analysis.reportPath, summary, filtered);
        updateDiagnostics(vscode, diagnosticCollection, filtered);
      } catch {
        // Silent background run: do not interrupt coding with error modals on every save.
      } finally {
        running = false;
      }
    }, debounceMs);
  }

  const sub = vscode.workspace?.onDidSaveTextDocument
    ? vscode.workspace.onDidSaveTextDocument((doc) => {
        void handleDocumentSaved(doc);
      })
    : { dispose: () => {} };

  return {
    handleDocumentSaved,
    dispose() {
      if (timer) clearTimeout(timer);
      sub.dispose();
    },
  };
}

module.exports = {
  createOnSaveController,
};

