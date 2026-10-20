"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openReport = openReport;
const webviewSecurity_1 = require("./webviewSecurity");
const libraries_1 = require("./reports/libraries");
const branding_1 = require("./reports/branding");
const integrity_1 = require("./reports/integrity");
const reportScripts_1 = require("./reportScripts");
const i18n_1 = require("./i18n");
const node_fs_1 = __importDefault(require("node:fs"));
const config_1 = require("./config");
/**
 * @param vscode The vscode API module.
 * @param reportPath Absolute local filesystem path to the generated HTML report.
 * @param analysisId Analysis ID, used only for the panel title.
 */
async function openReport(vscode, reportPath, analysisId) {
    try {
        const reportUri = vscode.Uri.file(reportPath);
        const mode = (0, config_1.getReportOpenMode)(vscode);
        // Reports already contain their browser assets. Do not load or rewrite them in
        // the extension host just to hand the file to another application.
        const stat = await node_fs_1.default.promises.stat(reportPath);
        if (mode === 'external' || (mode !== 'vscode' && stat.size > 16 * 1024 * 1024)) {
            if (!await vscode.env.openExternal(reportUri)) {
                throw new Error(`Could not open report in the default browser: ${reportPath}`);
            }
            return;
        }
        if (mode === 'vscode') {
            await vscode.commands.executeCommand('vscode.open', reportUri);
            return;
        }
        const originalHtml = await node_fs_1.default.promises.readFile(reportPath, 'utf-8');
        if ((0, integrity_1.hasIncompleteAstMarkup)(originalHtml)) {
            vscode.window.showErrorMessage((0, i18n_1.translator)(vscode)('This saved report has incomplete AST markup. Run "Analyze Current Workspace" to regenerate it. The original report and saved reviews have been kept.'));
            return;
        }
        const enhancedHtml = (0, branding_1.injectReportBranding)((0, reportScripts_1.injectReportTabs)((0, reportScripts_1.injectTableFilter)((0, reportScripts_1.injectReviewCopy)((0, libraries_1.upgradeReportLibraries)(originalHtml)))));
        const panel = vscode.window.createWebviewPanel('codeDoctorReport', (0, i18n_1.translator)(vscode)('Codes Doctor Report: {analysisId}', { analysisId }), vscode.ViewColumn.Active, {
            enableScripts: true,
            localResourceRoots: [],
        });
        panel.webview.onDidReceiveMessage(async (input) => {
            if (!input || typeof input !== 'object')
                return;
            const message = input;
            if (message?.type !== 'copyReview' || !(0, reportScripts_1.isReviewTargetId)(message.id) || typeof message.text !== 'string')
                return;
            let ok = true;
            try {
                await vscode.env.clipboard.writeText(message.text);
            }
            catch {
                ok = false;
            }
            await panel.webview.postMessage({ type: 'reviewCopied', id: message.id, ok });
        });
        const reportHtml = enhancedHtml;
        panel.webview.html = (0, webviewSecurity_1.secureWebviewHtml)(reportHtml, panel.webview.cspSource);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage((0, i18n_1.translator)(vscode)('Failed to open report: {message}', { message }));
    }
}
module.exports = {
    openReport,
};
