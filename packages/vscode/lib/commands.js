"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommands = createCommands;
const i18n_1 = require("./i18n");
const reportViewer_1 = require("./reportViewer");
const lastAnalysisState_1 = require("./lastAnalysisState");
const summary_1 = require("./summary");
const aiFixPreview_1 = require("./aiFixPreview");
const workspaceAnalysisCommands_1 = require("./workspaceAnalysisCommands");
const apiKeyCommand_1 = require("./apiKeyCommand");
/**
 * The extension's command handlers. Analysis runs and API key setup live in their own modules;
 * this keeps the small commands that work on the last analysis and the editor.
 */
function createCommands(vscode, context, diagnosticCollection) {
    const t = (0, i18n_1.translator)(vscode);
    const { analyzeCurrentWorkspace, analyzeGitChanges } = (0, workspaceAnalysisCommands_1.createWorkspaceAnalysisCommands)(vscode, context, diagnosticCollection);
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
        return (0, apiKeyCommand_1.promptForLlmApiKey)(vscode, context);
    }
    async function previewAiFix(options) {
        return (0, aiFixPreview_1.previewAndApplyAiFix)(vscode, context, options);
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
