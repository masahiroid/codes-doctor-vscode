const fs = require('node:fs');
const { openReport } = require('./reportViewer');
const { analyzeWorkspace, getDefaultOutputDir } = require('./analyzer');
const { getAnalysisLanguage, getLlmProvider } = require('./config');
const { setApiKey } = require('./secrets');
const { setLastAnalysis } = require('./lastAnalysisState');

const PROVIDER_LABELS = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
};

function createCommands(vscode, context) {
  async function analyzeCurrentWorkspace() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder is open. Open a folder and try again.');
      return;
    }

    let targetFolder = folders[0];
    if (folders.length > 1) {
      const picked = await vscode.window.showQuickPick(
        folders.map((folder) => ({
          label: folder.name,
          description: folder.uri.fsPath,
          folder,
        })),
        {
          title: 'Select Workspace Folder for Codes Doctor Analysis',
        }
      );

      if (!picked) {
        return;
      }
      targetFolder = picked.folder;
    }

    const language = getAnalysisLanguage(vscode);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Codes Doctor analysis running',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `Analyzing ${targetFolder.name} (${language})...` });

        const outputDir = getDefaultOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });

        const result = await analyzeWorkspace(targetFolder.uri.fsPath, language, outputDir);
        setLastAnalysis(result.analysisId, outputDir);

        progress.report({ message: 'Opening report...' });
        await openReport(vscode, result.reportPath, result.analysisId);

        vscode.window.showInformationMessage(`Codes Doctor report ready: ${result.analysisId}`);
      }
    ).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Codes Doctor analysis failed: ${message}`);
    });
  }

  async function setLlmApiKey() {
    const provider = getLlmProvider(vscode);
    const providerLabel = PROVIDER_LABELS[provider] || provider;

    const apiKey = await vscode.window.showInputBox({
      title: `Set ${providerLabel} API Key`,
      prompt: `Enter your ${providerLabel} API key. It is stored securely in VS Code's secret storage (not in settings.json).`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: provider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
    });

    if (apiKey === undefined) {
      return;
    }

    await setApiKey(context, provider, apiKey.trim());
    if (apiKey.trim()) {
      vscode.window.showInformationMessage(`${providerLabel} API key saved.`);
    } else {
      vscode.window.showInformationMessage(`${providerLabel} API key cleared.`);
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
