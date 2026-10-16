"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommands = createCommands;
const i18n_1 = require("./i18n");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const reportViewer_1 = require("./reportViewer");
const analyzer_1 = require("./analyzer");
const config_1 = require("./config");
const secrets_1 = require("./secrets");
const lastAnalysisState_1 = require("./lastAnalysisState");
const summary_1 = require("./summary");
const diagnostics_1 = require("./diagnostics");
const PROVIDER_LABELS = {
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
};
function createCommands(vscode, context, diagnosticCollection) {
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
            const customDir = (0, config_1.getCustomOutputDir)(vscode);
            const outputDir = customDir
                ? (node_path_1.default.isAbsolute(customDir) ? customDir : node_path_1.default.resolve(targetFolder.uri.fsPath, customDir))
                : (0, analyzer_1.getDefaultOutputDir)(context);
            node_fs_1.default.mkdirSync(outputDir, { recursive: true });
            const analysis = await (0, analyzer_1.analyzeWorkspace)(targetFolder.uri.fsPath, language, outputDir, (0, config_1.getDisplayLanguage)(vscode));
            const minSecurity = (0, config_1.getMinSecurity)(vscode);
            const minTechnicalDebt = (0, config_1.getMinTechnicalDebt)(vscode);
            const summary = (0, summary_1.summarize)(analysis.result, analysis.reportPath, { minSecurity, minTechnicalDebt });
            (0, lastAnalysisState_1.setLastAnalysis)(analysis.analysisId, outputDir, analysis.reportPath, summary, analysis.result);
            (0, diagnostics_1.updateDiagnostics)(vscode, diagnosticCollection, analysis.result);
            progress.report({ message: t("Opening report...") });
            await (0, reportViewer_1.openReport)(vscode, analysis.reportPath, analysis.analysisId);
            const openText = t('Open Report');
            const copyText = t('Copy Summary');
            if (summary.failures.length > 0) {
                const failures = summary.failures.join(', ');
                vscode.window
                    .showWarningMessage(t('Quality gate failed: {failures}', { failures }), openText, copyText)
                    .then(async (action) => {
                    if (action === openText)
                        await (0, reportViewer_1.openReport)(vscode, analysis.reportPath, analysis.analysisId);
                    else if (action === copyText) {
                        await vscode.env.clipboard.writeText((0, summary_1.formatSummary)(summary));
                        vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
                    }
                });
            }
            else {
                const sec = summary.security ? `${summary.security.score}/100` : 'N/A';
                const debt = summary.technicalDebt ? `${summary.technicalDebt.score}/100` : 'N/A';
                const summaryStr = `Security: ${sec}, Debt: ${debt}`;
                vscode.window
                    .showInformationMessage(t('Codes Doctor analysis ready ({summary})', { summary: summaryStr }), openText, copyText)
                    .then(async (action) => {
                    if (action === openText)
                        await (0, reportViewer_1.openReport)(vscode, analysis.reportPath, analysis.analysisId);
                    else if (action === copyText) {
                        await vscode.env.clipboard.writeText((0, summary_1.formatSummary)(summary));
                        vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
                    }
                });
            }
        })).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
        });
    }
    async function copySummary() {
        const last = (0, lastAnalysisState_1.getLastAnalysis)();
        if (!last || !last.summary) {
            vscode.window.showWarningMessage(t('No analysis results available yet. Run "Analyze Current Workspace" first.'));
            return;
        }
        await vscode.env.clipboard.writeText((0, summary_1.formatSummary)(last.summary));
        vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
    }
    async function copySummaryJson() {
        const last = (0, lastAnalysisState_1.getLastAnalysis)();
        if (!last || !last.summary) {
            vscode.window.showWarningMessage(t('No analysis results available yet. Run "Analyze Current Workspace" first.'));
            return;
        }
        await vscode.env.clipboard.writeText(JSON.stringify(last.summary, null, 2));
        vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
    }
    async function openLastReport() {
        const last = (0, lastAnalysisState_1.getLastAnalysis)();
        if (!last || !last.reportPath) {
            vscode.window.showWarningMessage(t('No analysis results available yet. Run "Analyze Current Workspace" first.'));
            return;
        }
        await (0, reportViewer_1.openReport)(vscode, last.reportPath, last.analysisId);
    }
    async function clearDiagnostics() {
        diagnosticCollection?.clear();
        vscode.window.showInformationMessage(t('Editor diagnostics cleared.'));
    }
    async function openFindingLocation(filePath, lineOneBased) {
        if (!filePath || typeof filePath !== 'string')
            return;
        const uri = vscode.Uri.file(filePath);
        const lineIdx = typeof lineOneBased === 'number' && lineOneBased > 0 ? lineOneBased - 1 : 0;
        const range = new vscode.Range(lineIdx, 0, lineIdx, 0);
        await vscode.window.showTextDocument(uri, { selection: range });
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
