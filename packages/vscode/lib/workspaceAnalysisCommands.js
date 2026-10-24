"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorkspaceAnalysisCommands = createWorkspaceAnalysisCommands;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const i18n_1 = require("./i18n");
const reportViewer_1 = require("./reportViewer");
const analyzer_1 = require("./analyzer");
const config_1 = require("./config");
const lastAnalysisState_1 = require("./lastAnalysisState");
const summary_1 = require("./summary");
const diagnostics_1 = require("./diagnostics");
const ignoreComments_1 = require("./ignoreComments");
const gitDiff_1 = require("./gitDiff");
/**
 * The two commands that run a workspace analysis: the whole workspace, or only the files changed
 * in Git. Both pick the folder, write the report, record the result for the other commands, update
 * editor diagnostics and offer to open the report or copy the summary.
 */
function createWorkspaceAnalysisCommands(vscode, context, diagnosticCollection) {
    const t = (0, i18n_1.translator)(vscode);
    async function pickWorkspaceFolder() {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            vscode.window.showErrorMessage(t("No workspace folder is open. Open a folder and try again."));
            return undefined;
        }
        if (folders.length === 1)
            return folders[0];
        const picked = await vscode.window.showQuickPick(folders.map((folder) => ({
            label: folder.name,
            description: folder.uri.fsPath,
            folder,
        })), {
            title: t("Select Workspace Folder for Codes Doctor Analysis"),
        });
        return picked?.folder;
    }
    /** The configured output folder (relative paths are inside the workspace folder), created if needed. */
    function outputDirFor(folder) {
        const customDir = (0, config_1.getCustomOutputDir)(vscode);
        const outputDir = customDir
            ? (node_path_1.default.isAbsolute(customDir) ? customDir : node_path_1.default.resolve(folder.uri.fsPath, customDir))
            : (0, analyzer_1.getDefaultOutputDir)(context);
        node_fs_1.default.mkdirSync(outputDir, { recursive: true });
        return outputDir;
    }
    /**
     * Analyze the folder, narrow the result (ignore comments, then the caller's filter), and make it
     * the current analysis: summary with quality gates, last-analysis state and editor diagnostics.
     */
    async function runAnalysis(folder, language, narrow = (result) => result) {
        const outputDir = outputDirFor(folder);
        const analysis = await (0, analyzer_1.analyzeWorkspace)(folder.uri.fsPath, language, outputDir, (0, config_1.getDisplayLanguage)(vscode));
        const result = narrow((0, ignoreComments_1.applyIgnoreComments)(analysis.result));
        const minSecurity = (0, config_1.getMinSecurity)(vscode);
        const minTechnicalDebt = (0, config_1.getMinTechnicalDebt)(vscode);
        const summary = (0, summary_1.summarize)(result, analysis.reportPath, { minSecurity, minTechnicalDebt });
        (0, lastAnalysisState_1.setLastAnalysis)(analysis.analysisId, outputDir, analysis.reportPath, summary, result);
        (0, diagnostics_1.updateDiagnostics)(vscode, diagnosticCollection, result);
        return { analysis, result, summary };
    }
    /** A failed quality gate as a warning, otherwise `readyMessage`; either offers to open the report or copy the summary. */
    function announce(analysis, summary, readyMessage) {
        const openText = t('Open Report');
        const copyText = t('Copy Summary');
        const shown = summary.failures.length > 0
            ? vscode.window.showWarningMessage(t('Quality gate failed: {failures}', { failures: summary.failures.join(', ') }), openText, copyText)
            : vscode.window.showInformationMessage(readyMessage(), openText, copyText);
        shown.then(async (action) => {
            if (action === openText)
                await (0, reportViewer_1.openReport)(vscode, analysis.reportPath, analysis.analysisId);
            else if (action === copyText) {
                await vscode.env.clipboard.writeText((0, summary_1.formatSummary)(summary));
                vscode.window.showInformationMessage(t('Analysis summary copied to clipboard.'));
            }
        });
    }
    /** Run `task` under the analysis progress notification; any failure becomes one error message. */
    async function withAnalysisProgress(task) {
        await Promise.resolve(vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t("Codes Doctor analysis running"),
            cancellable: false,
        }, task)).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(t('Codes Doctor analysis failed: {message}', { message }));
        });
    }
    async function analyzeCurrentWorkspace() {
        const targetFolder = await pickWorkspaceFolder();
        if (!targetFolder)
            return;
        const language = (0, config_1.getAnalysisLanguage)(vscode);
        await withAnalysisProgress(async (progress) => {
            progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });
            const { analysis, summary } = await runAnalysis(targetFolder, language);
            progress.report({ message: t("Opening report...") });
            await (0, reportViewer_1.openReport)(vscode, analysis.reportPath, analysis.analysisId);
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
        if (!targetFolder)
            return;
        let changedFiles;
        try {
            changedFiles = (0, gitDiff_1.getGitChangedFiles)(targetFolder.uri.fsPath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(t('Could not inspect Git changes: {message}', { message }));
            return;
        }
        if (changedFiles.length === 0) {
            vscode.window.showInformationMessage(t('No changed files detected in Git.'));
            return;
        }
        const language = (0, config_1.getAnalysisLanguage)(vscode);
        await withAnalysisProgress(async (progress) => {
            progress.report({ message: t('Analyzing {name} ({language})...', { name: targetFolder.name, language }) });
            const { analysis, result, summary } = await runAnalysis(targetFolder, language, (ignored) => (0, gitDiff_1.filterResultByChangedFiles)(ignored, changedFiles));
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
