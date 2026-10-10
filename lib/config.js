"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtensionConfig = getExtensionConfig;
exports.getReportOpenMode = getReportOpenMode;
exports.getAnalysisLanguage = getAnalysisLanguage;
exports.getDisplayLanguage = getDisplayLanguage;
exports.getLlmProvider = getLlmProvider;
exports.getLlmOutputMode = getLlmOutputMode;
exports.getLlmModel = getLlmModel;
exports.getLlmMaxOutputTokens = getLlmMaxOutputTokens;
const settingsSchema_1 = require("./settingsSchema");
function getExtensionConfig(vscode) {
    return vscode.workspace.getConfiguration(settingsSchema_1.CONFIGURATION_SECTION);
}
function getReportOpenMode(vscode) {
    const config = getExtensionConfig(vscode);
    const mode = config.get('reportOpenMode', (0, settingsSchema_1.setting)('reportOpenMode').default);
    return typeof mode === 'string' ? mode : (0, settingsSchema_1.setting)('reportOpenMode').default;
}
function getAnalysisLanguage(vscode) {
    const config = getExtensionConfig(vscode);
    const language = config.get('analysisLanguage', (0, settingsSchema_1.setting)('analysisLanguage').default);
    return typeof language === 'string' ? language : (0, settingsSchema_1.setting)('analysisLanguage').default;
}
function getDisplayLanguage(vscode) {
    const config = getExtensionConfig(vscode);
    // The dashboard saves this application-wide preference in user settings.
    // Older workspace settings must not override the user's saved selection.
    const language = config.inspect('displayLanguage')?.globalValue ?? config.get('displayLanguage', (0, settingsSchema_1.setting)('displayLanguage').default);
    return language === 'ja' ? 'ja' : 'en';
}
function getLlmProvider(vscode) {
    const config = getExtensionConfig(vscode);
    const provider = config.get('llmProvider', (0, settingsSchema_1.setting)('llmProvider').default);
    return provider === 'anthropic' ? 'anthropic' : 'openai';
}
function getLlmOutputMode(vscode) {
    const mode = getExtensionConfig(vscode).get('llmOutputMode', (0, settingsSchema_1.setting)('llmOutputMode').default);
    return mode === 'agentPrompt' ? 'agentPrompt' : 'review';
}
function getLlmModel(vscode) {
    const config = getExtensionConfig(vscode);
    const model = config.get('llmModel', (0, settingsSchema_1.setting)('llmModel').default);
    return typeof model === 'string' ? model : (0, settingsSchema_1.setting)('llmModel').default;
}
function getLlmMaxOutputTokens(vscode) {
    const value = getExtensionConfig(vscode).get('llmMaxOutputTokens', (0, settingsSchema_1.setting)('llmMaxOutputTokens').default);
    return (0, settingsSchema_1.isValidTokenLimit)(value) ? value : settingsSchema_1.TOKEN_LIMITS.defaultValue;
}
module.exports = {
    getLlmMaxOutputTokens,
    getExtensionConfig,
    getDisplayLanguage,
    getReportOpenMode,
    getAnalysisLanguage,
    getLlmProvider,
    getLlmOutputMode,
    getLlmModel,
};
