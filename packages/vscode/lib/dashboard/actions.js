"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDashboardMessage = handleDashboardMessage;
exports.fetchDashboardModels = fetchDashboardModels;
exports.openDashboardReport = openDashboardReport;
const settings_1 = require("./settings");
const settingsSchema_1 = require("../settingsSchema");
const config_1 = require("../config");
const secrets_1 = require("../secrets");
const analyzer_1 = require("../analyzer");
const lastAnalysisState_1 = require("../lastAnalysisState");
const reportViewer_1 = require("../reportViewer");
async function handleDashboardMessage(dashboard, input) {
    if (!input || typeof input !== 'object')
        return;
    const message = input;
    if (typeof message.type !== 'string')
        return;
    if (message.type === 'command' && typeof message.command === 'string') {
        if (!Object.values(settingsSchema_1.COMMANDS).includes(message.command))
            return;
        await dashboard.vscode.commands.executeCommand(message.command);
        return;
    }
    if (message.type === 'setSetting' && typeof message.key === 'string' && typeof message.value === 'string') {
        const field = settings_1.SETTINGS_FIELDS.find((f) => f.settingKey === message.key);
        if (!field || !field.options.some((option) => option.value === message.value))
            return;
        const config = (0, config_1.getExtensionConfig)(dashboard.vscode);
        await config.update(field.settingKey, message.value, dashboard.vscode.ConfigurationTarget.Global);
        if (field.settingKey === 'llmProvider') {
            // Switching provider invalidates the previously fetched model list.
            dashboard.fetchedModels = [];
            dashboard.modelFetchError = null;
        }
        dashboard.render();
        return;
    }
    if (message.type === 'setLlmModel' && typeof message.value === 'string') {
        const config = (0, config_1.getExtensionConfig)(dashboard.vscode);
        await config.update('llmModel', message.value, dashboard.vscode.ConfigurationTarget.Global);
        dashboard.render();
        return;
    }
    if (message.type === 'setLlmMaxOutputTokens') {
        if (!(0, settingsSchema_1.isValidTokenLimit)(message.value))
            return;
        await (0, config_1.getExtensionConfig)(dashboard.vscode).update('llmMaxOutputTokens', message.value, dashboard.vscode.ConfigurationTarget.Global);
        dashboard.render();
        return;
    }
    if (message.type === 'fetchModels') {
        await dashboard.fetchModels();
        return;
    }
    if (message.type === 'runLlmAnalysis') {
        if (dashboard.isRunningLlmAnalysis)
            return;
        await dashboard.runLlmAnalysis();
        return;
    }
    if (message.type === 'openReportFromHistory' && typeof message.analysisId === 'string') {
        await dashboard.openReportFromHistory(message.analysisId);
        return;
    }
}
async function fetchDashboardModels(dashboard) {
    const provider = (0, config_1.getLlmProvider)(dashboard.vscode);
    const apiKey = await (0, secrets_1.getApiKey)(dashboard.context, provider);
    if (!apiKey) {
        dashboard.modelFetchError = dashboard.t('No API key set for {provider}. Run "Codes Doctor: Set LLM API Key" first.', { provider });
        dashboard.fetchedModels = [];
        dashboard.render();
        return;
    }
    dashboard.modelFetchError = dashboard.t("Fetching models...");
    dashboard.render();
    try {
        dashboard.fetchedModels = await (0, analyzer_1.listModels)(provider, apiKey);
        dashboard.modelFetchError = null;
    }
    catch (error) {
        dashboard.fetchedModels = [];
        dashboard.modelFetchError = error instanceof Error ? error.message : String(error);
    }
    dashboard.render();
}
async function openDashboardReport(dashboard, analysisId) {
    const outputDir = (0, analyzer_1.getDefaultOutputDir)(dashboard.context);
    const reports = (0, analyzer_1.listReports)(outputDir);
    const match = reports.find((r) => r.analysisId === analysisId);
    if (!match) {
        dashboard.vscode.window.showErrorMessage(dashboard.t('Report not found: {analysisId}', { analysisId }));
        return;
    }
    (0, lastAnalysisState_1.setLastAnalysis)(match.analysisId, outputDir, match.reportPath);
    dashboard.llmAnalysisStatus = null;
    dashboard.render();
    await (0, reportViewer_1.openReport)(dashboard.vscode, match.reportPath, match.analysisId);
}
