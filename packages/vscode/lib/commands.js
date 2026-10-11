"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommands = createCommands;
const i18n_1 = require("./i18n");
const node_fs_1 = __importDefault(require("node:fs"));
const reportViewer_1 = require("./reportViewer");
const analyzer_1 = require("./analyzer");
const config_1 = require("./config");
const secrets_1 = require("./secrets");
const lastAnalysisState_1 = require("./lastAnalysisState");
const PROVIDER_LABELS = {
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
};
function createCommands(vscode, context) {
    const t = (0, i18n_1.translator)(vscode);
    async function analyzeCurrentWorkspace() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage(t("No workspace folder is open. Open a folder and try again."));
            return;
        }
        let targetFolder = folders[0];
        if (folders.length > 1) {
            const picked = await vscode.window.showQuickPick(folders.map((folder) => ({
                label: folder.name,
                description: folder.uri.fsPath,
                folder,
            })), {
                title: t("Select Workspace Folder for Codes Doctor Analysis"),
            });
            if (!picked) {
                return;
            }
            targetFolder = picked.folder;
        }
        const language = (0, config_1.getAnalysisLanguage)(vscode);
        await Promise.resolve(vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t("Codes Doctor analysis running"),
            cancellable: false,
        }, async (progress) => {
            progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });
            const outputDir = (0, analyzer_1.getDefaultOutputDir)(context);
            node_fs_1.default.mkdirSync(outputDir, { recursive: true });
            const result = await (0, analyzer_1.analyzeWorkspace)(targetFolder.uri.fsPath, language, outputDir, (0, config_1.getDisplayLanguage)(vscode));
            (0, lastAnalysisState_1.setLastAnalysis)(result.analysisId, outputDir, result.reportPath);
            progress.report({ message: t("Opening report...") });
            await (0, reportViewer_1.openReport)(vscode, result.reportPath, result.analysisId);
            vscode.window.showInformationMessage(t('Codes Doctor report ready: {analysisId}', { analysisId: result.analysisId }));
        })).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
        });
    }
    async function setLlmApiKey() {
        const provider = (0, config_1.getLlmProvider)(vscode);
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
        await (0, secrets_1.setApiKey)(context, provider, apiKey.trim());
        if (apiKey.trim()) {
            vscode.window.showInformationMessage(t('{provider} API key saved.', { provider: providerLabel }));
        }
        else {
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
