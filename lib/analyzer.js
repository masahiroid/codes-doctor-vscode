const path = require('node:path');

/**
 * Thin wrapper around the vendored CSAP engine (vendor/csap/, copied from the
 * CSAP repo's dist/ at build time — see scripts/vendor-csap.js). Keeping this
 * as the only module that knows the vendor path makes it easy to swap later.
 */
function loadCsapEngine() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require('../vendor/csap/services/pathAnalysis');
}

/**
 * Analyze a workspace folder and write the HTML report under outputDir.
 * @param {string} repoPath Absolute path to the workspace folder to analyze.
 * @param {string} language 'auto' | 'typescript' | 'javascript' | 'php' | 'dart' | 'python'
 * @param {string} outputDir Absolute path where the report (and LLM context
 * files) should be written.
 * @returns {Promise<{ analysisId: string, repoPath: string, reportPath: string }>}
 */
async function analyzeWorkspace(repoPath, language, outputDir) {
  const { analyzePathRequest } = loadCsapEngine();
  return analyzePathRequest(repoPath, language, outputDir);
}

/**
 * Fetch the live list of models available for a provider, using the given API key.
 * The key is never persisted by this call — it's forwarded straight to the provider's API.
 * @param {'openai'|'anthropic'} providerId
 * @param {string} apiKey
 * @returns {Promise<Array<{ id: string, label?: string }>>}
 */
async function listModels(providerId, apiKey) {
  // eslint-disable-next-line global-require
  const { listLlmModels } = require('../vendor/csap/services/llmService');
  return listLlmModels(providerId, apiKey);
}

/**
 * Run an LLM structural review against a previously generated analysis.
 * @param {object} params
 * @param {string} params.analysisId
 * @param {string} params.outputDir Must match the outputDir used for analyzeWorkspace.
 * @param {'openai'|'anthropic'} params.provider
 * @param {string} params.apiKey
 * @param {string} [params.model]
 * @param {boolean} [params.astOnlyMode]
 * @param {string} [params.focus]
 * @param {number} [params.maxOutputTokens]
 * @param {number} [params.temperature]
 * @returns {Promise<{ cached: boolean, result: string }>}
 */
async function runLlmAnalysis(params) {
  // eslint-disable-next-line global-require
  const { analyzeLlmRequest } = require('../vendor/csap/services/llmService');
  const config = {
    features: { llm: true },
    paths: { output: params.outputDir },
    llm: {
      provider: params.provider,
      model: params.model || '',
      astOnlyModel: params.model || '',
      maxTokens: params.maxOutputTokens || 3000,
      astOnlyMaxTokens: params.maxOutputTokens || 4000,
      temperature: typeof params.temperature === 'number' ? params.temperature : 0.2,
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

function getDefaultOutputDir(context) {
  return path.join(context.globalStorageUri.fsPath, 'reports');
}

module.exports = {
  analyzeWorkspace,
  listModels,
  runLlmAnalysis,
  getDefaultOutputDir,
};
