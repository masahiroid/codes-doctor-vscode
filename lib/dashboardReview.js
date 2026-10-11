"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeDashboardReview = executeDashboardReview;
const config_1 = require("./config");
const secrets_1 = require("./secrets");
const analyzer_1 = require("./analyzer");
const lastAnalysisState_1 = require("./lastAnalysisState");
const reportViewer_1 = require("./reportViewer");
// Executes the review workflow; the provider owns UI status and rendering.
async function executeDashboardReview(dashboard) {
    if (dashboard.isRunningLlmAnalysis)
        return;
    const lastAnalysis = (0, lastAnalysisState_1.getLastAnalysis)();
    if (!lastAnalysis) {
        dashboard.vscode.window.showErrorMessage(dashboard.t("Run \"Analyze Current Workspace\" first, then request an LLM review."));
        return;
    }
    const provider = (0, config_1.getLlmProvider)(dashboard.vscode);
    const apiKey = await (0, secrets_1.getApiKey)(dashboard.context, provider);
    if (!apiKey) {
        dashboard.vscode.window.showErrorMessage(dashboard.t('No API key set for {provider}. Run "Codes Doctor: Set LLM API Key" first.', { provider }));
        return;
    }
    const model = (0, config_1.getLlmModel)(dashboard.vscode);
    const agentPrompt = (0, config_1.getLlmOutputMode)(dashboard.vscode) === 'agentPrompt';
    dashboard.isRunningLlmAnalysis = true;
    dashboard.llmAnalysisStatus = { kind: 'running', provider, model };
    dashboard.render();
    await dashboard.vscode.window.withProgress({
        location: dashboard.vscode.ProgressLocation.Notification,
        title: dashboard.t(agentPrompt ? 'Generating AI coding prompt ({details})' : 'Running LLM review ({details})', { details: [provider, model].filter(Boolean).join(', ') }),
        cancellable: false,
    }, async () => {
        try {
            await (0, analyzer_1.runLlmAnalysis)({
                analysisId: lastAnalysis.analysisId,
                outputDir: lastAnalysis.outputDir,
                provider,
                apiKey,
                model: model || undefined,
                focus: agentPrompt ? analyzer_1.LLM_FOCUS.agentPrompt : undefined,
                maxOutputTokens: (0, config_1.getLlmMaxOutputTokens)(dashboard.vscode),
                displayLanguage: (0, analyzer_1.getReportLanguage)(lastAnalysis.reportPath),
            });
            dashboard.llmAnalysisStatus = { kind: 'done', provider, model };
            // The review is patched into the saved report file in place, but an already-open
            // tab/panel won't pick that up on its own — reopen it so the result is visible
            // without the user having to find and manually reload that tab.
            if (lastAnalysis.reportPath) {
                await (0, reportViewer_1.openReport)(dashboard.vscode, lastAnalysis.reportPath, lastAnalysis.analysisId);
            }
            const mode = (0, config_1.getReportOpenMode)(dashboard.vscode);
            const doneMessage = mode === 'external'
                ? dashboard.t("LLM review complete. Opened in a new browser tab — close any older tab for this report.")
                : dashboard.t("LLM review complete. Report updated.");
            dashboard.vscode.window.showInformationMessage(doneMessage);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            dashboard.llmAnalysisStatus = { kind: 'error', message };
            dashboard.vscode.window.showErrorMessage(dashboard.t('LLM review failed: {message}', { message }));
        }
        finally {
            dashboard.isRunningLlmAnalysis = false;
            dashboard.render();
        }
    });
}
module.exports = { executeDashboardReview };
