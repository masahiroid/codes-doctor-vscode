"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listReports = exports.listLlmResults = exports.getDefaultOutputDir = exports.getReportLanguage = exports.LLM_FOCUS = void 0;
exports.analyzeWorkspace = analyzeWorkspace;
exports.listModels = listModels;
exports.runLlmAnalysis = runLlmAnalysis;
const repository_1 = require("./reports/repository");
Object.defineProperty(exports, "getReportLanguage", { enumerable: true, get: function () { return repository_1.getReportLanguage; } });
Object.defineProperty(exports, "getDefaultOutputDir", { enumerable: true, get: function () { return repository_1.getDefaultOutputDir; } });
Object.defineProperty(exports, "listLlmResults", { enumerable: true, get: function () { return repository_1.listLlmResults; } });
Object.defineProperty(exports, "listReports", { enumerable: true, get: function () { return repository_1.listReports; } });
const settingsSchema_1 = require("./settingsSchema");
const engine_1 = require("./engine");
/**
 * Analyze a workspace folder and write the HTML report under outputDir.
 * @param {string} repoPath Absolute path to the workspace folder to analyze.
 * @param {string} language 'auto' | 'typescript' | 'javascript' | 'php' | 'dart' | 'python'
 * @param {string} outputDir Absolute path where the report (and LLM context
 * files) should be written.
 * @param {'en'|'ja'} displayLanguage UI and report language (English by default).
 * @returns {Promise<{ analysisId: string, repoPath: string, reportPath: string, result: import('./engine').AnalysisResult }>}
 */
async function analyzeWorkspace(repoPath, language, outputDir, displayLanguage = 'en') {
    const { analyzeRepository } = (0, engine_1.loadEngine)(displayLanguage);
    return analyzeRepository(repoPath, language, outputDir, { generatorVersion: settingsSchema_1.EXTENSION_VERSION });
}
/**
 * Fetch the live list of models available for a provider, using the given API key.
 * The key is never persisted by this call — it's forwarded straight to the provider's API.
 * @param {'openai'|'anthropic'} providerId
 * @param {string} apiKey
 * @returns {Promise<Array<{ id: string, label?: string }>>}
 */
async function listModels(providerId, apiKey) {
    return (0, engine_1.loadEngine)('ja').listLlmModels(providerId, apiKey);
}
/**
 * Run an LLM structural review against a previously generated analysis.
 * @param {object} params
 * @param {string} params.analysisId
 * @param {string} params.outputDir Must match the outputDir used for analyzeWorkspace.
 * @param {'openai'|'anthropic'} params.provider
 * @param {string} params.apiKey
 * @param {'en'|'ja'} [params.displayLanguage] Language of the target report.
 * @param {string} [params.model]
 * @param {boolean} [params.astOnlyMode]
 * @param {string} [params.focus]
 * @param {number} [params.maxOutputTokens]
 * @param {number} [params.temperature]
 * @returns {Promise<{ cached: boolean, result: string }>}
 */
async function runLlmAnalysis(params) {
    const { analyzeLlmRequest } = (0, engine_1.loadEngine)(params.displayLanguage === 'ja' ? 'ja' : 'en');
    const config = {
        features: { llm: true },
        paths: { output: params.outputDir },
        llm: {
            provider: params.provider,
            model: params.model || '',
            astOnlyModel: params.model || '',
            maxTokens: params.maxOutputTokens || settingsSchema_1.LLM_DEFAULTS.fullReviewTokens,
            astOnlyMaxTokens: params.maxOutputTokens || settingsSchema_1.LLM_DEFAULTS.astReviewTokens,
            temperature: typeof params.temperature === 'number' ? params.temperature : settingsSchema_1.LLM_DEFAULTS.temperature,
        },
    };
    // The extension supplies only the settings the review uses; the rest keep the engine's defaults.
    return analyzeLlmRequest(config, {
        analysisId: params.analysisId,
        focus: params.focus,
        useCache: false,
        astOnlyMode: Boolean(params.astOnlyMode),
        provider: params.provider,
        apiKey: params.apiKey,
        model: params.model,
        maxOutputTokens: params.maxOutputTokens,
        temperature: params.temperature,
    });
}
/** Analysis focus IDs, owned by the engine (identical in both locale builds). */
exports.LLM_FOCUS = (0, engine_1.loadEngine)('ja').LLM_FOCUS;
module.exports = {
    LLM_FOCUS: exports.LLM_FOCUS,
    analyzeWorkspace,
    getReportLanguage: repository_1.getReportLanguage,
    listModels,
    runLlmAnalysis,
    listLlmResults: repository_1.listLlmResults,
    listReports: repository_1.listReports,
    getDefaultOutputDir: repository_1.getDefaultOutputDir,
};
