import { translator } from './i18n';
import fs from 'node:fs';
import { openReport } from './reportViewer';
import { analyzeWorkspace, getDefaultOutputDir } from './analyzer';
import { getAnalysisLanguage, getLlmProvider, getDisplayLanguage } from './config';
import { setApiKey } from './secrets';
import { setLastAnalysis } from './lastAnalysisState';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

export function createCommands(vscode: typeof import('vscode'), context: import('vscode').ExtensionContext) {
  const t = translator(vscode);
  async function analyzeCurrentWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage(t("No workspace folder is open. Open a folder and try again."));
      return;
    }

    let targetFolder = folders[0];
    if (folders.length > 1) {
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

      if (!picked) {
        return;
      }
      targetFolder = picked.folder;
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

        const outputDir = getDefaultOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });

        const result = await analyzeWorkspace(targetFolder.uri.fsPath, language, outputDir, getDisplayLanguage(vscode));
        setLastAnalysis(result.analysisId, outputDir, result.reportPath);

        progress.report({ message: t("Opening report...") });
        await openReport(vscode, result.reportPath, result.analysisId);

        vscode.window.showInformationMessage(t('Codes Doctor report ready: {analysisId}', { analysisId: result.analysisId }));
      }
    )).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
    });
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
    setLlmApiKey,
  };
}

module.exports = {
  createCommands,
};
