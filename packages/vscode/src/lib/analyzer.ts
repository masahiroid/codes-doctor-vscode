import type { LlmReviewRequest } from './types';
import { getReportLanguage, getDefaultOutputDir, listLlmResults, listReports } from './reports/repository';
import { LLM_DEFAULTS } from './settingsSchema';

/**
 * Thin wrapper around the vendored CSAP engine (vendor/csap/, copied from the
 * CSAP repo's dist/ at build time — see scripts/vendor-csap.js). Keeping this
 * as the only module that knows the vendor path makes it easy to swap later.
 */
function loadCsapEngine(displayLanguage: 'en' | 'ja' = 'en') {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(`../vendor/${displayLanguage === 'ja' ? 'csap' : 'csap-en'}/services/pathAnalysis`) as {
    analyzePathRequest(repoPath: string, language: string, outputDir: string): Promise<{ analysisId: string; repoPath: string; reportPath: string }>;
  };
}

/**
 * Analyze a workspace folder and write the HTML report under outputDir.
 * @param {string} repoPath Absolute path to the workspace folder to analyze.
 * @param {string} language 'auto' | 'typescript' | 'javascript' | 'php' | 'dart' | 'python'
 * @param {string} outputDir Absolute path where the report (and LLM context
 * files) should be written.
 * @param {'en'|'ja'} displayLanguage UI and report language (English by default).
 * @returns {Promise<{ analysisId: string, repoPath: string, reportPath: string }>}
 */
export async function analyzeWorkspace(repoPath: string, language: string, outputDir: string, displayLanguage: 'en' | 'ja' = 'en') {
  const { analyzePathRequest } = loadCsapEngine(displayLanguage);
  return analyzePathRequest(repoPath, language, outputDir);
}

/**
 * Fetch the live list of models available for a provider, using the given API key.
 * The key is never persisted by this call — it's forwarded straight to the provider's API.
 * @param {'openai'|'anthropic'} providerId
 * @param {string} apiKey
 * @returns {Promise<Array<{ id: string, label?: string }>>}
 */
export async function listModels(providerId: 'openai' | 'anthropic', apiKey: string) {
  // eslint-disable-next-line global-require
  const { listLlmModels }: { listLlmModels(provider: 'openai' | 'anthropic', key: string): Promise<Array<{ id: string; label?: string }>> } = require('../vendor/csap/services/llmService');
  return listLlmModels(providerId, apiKey);
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
export async function runLlmAnalysis(params: import('./types').LlmReviewRequest) {
  // eslint-disable-next-line global-require
  const { analyzeLlmRequest }: { analyzeLlmRequest(config: unknown, request: Omit<LlmReviewRequest, 'outputDir'> & { useCache: boolean }): Promise<{ cached: boolean; result: string }> } = require(`../vendor/${params.displayLanguage === 'ja' ? 'csap' : 'csap-en'}/services/llmService`);
  const config = {
    features: { llm: true },
    paths: { output: params.outputDir },
    llm: {
      provider: params.provider,
      model: params.model || '',
      astOnlyModel: params.model || '',
      maxTokens: params.maxOutputTokens || LLM_DEFAULTS.fullReviewTokens,
      astOnlyMaxTokens: params.maxOutputTokens || LLM_DEFAULTS.astReviewTokens,
      temperature: typeof params.temperature === 'number' ? params.temperature : LLM_DEFAULTS.temperature,
    },
  };

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
// eslint-disable-next-line global-require
export const LLM_FOCUS: Readonly<{ review: string; astOnly: string; agentPrompt: string }> = require('../vendor/csap/llm/focus').LLM_FOCUS;

module.exports = {
  LLM_FOCUS,
  analyzeWorkspace,
  getReportLanguage,
  listModels,
  runLlmAnalysis,
  listLlmResults,
  listReports,
  getDefaultOutputDir,
};


export { getReportLanguage, getDefaultOutputDir, listLlmResults, listReports };
