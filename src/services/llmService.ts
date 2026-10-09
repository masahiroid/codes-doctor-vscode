import fs from 'node:fs';
import { getLlmProvider, LlmProviderId } from '../llm/providers';
import { getAstOnlyLlmContextPath, getLlmContextPath, getLlmResultPath } from '../llm/context';
import { getReportPath } from '../report/output';
import type { AppConfig } from '../types';
import { isValidAnalysisId } from '../validation';
import { escapeHtml } from '../html';

const PROVIDER_API_KEY_ENV: Record<LlmProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

function resolveApiKeyEnvVar(providerId: LlmProviderId): string {
  return PROVIDER_API_KEY_ENV[providerId];
}

export function getSavedLlmResult(
  analysisId: string,
  focus: string,
  outputDir?: string
): { result: string; createdAt?: string; mode?: string } | null {
  if (!isValidAnalysisId(analysisId)) {
    throw new Error('analysisId is invalid');
  }
  const resultPath = outputDir ? getLlmResultPath(analysisId, focus, outputDir) : getLlmResultPath(analysisId, focus);
  if (!fs.existsSync(resultPath)) {
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
  return {
    result: payload.result || '',
    createdAt: payload.createdAt,
    mode: payload.mode,
  };
}

function patchHtmlReport(analysisId: string, divId: string, newContent: string, outputDir?: string): void {
  const htmlPath = outputDir ? getReportPath(analysisId, outputDir) : getReportPath(analysisId);
  if (!fs.existsSync(htmlPath)) return;

  const escaped = escapeHtml(newContent);

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const pattern = new RegExp(`(<div id="${divId}"[^>]*>)[\\s\\S]*?(<\\/div>)`, '');
  const patched = html.replace(pattern, `$1${escaped}$2`);
  if (patched !== html) {
    fs.writeFileSync(htmlPath, patched, 'utf-8');
  }
}

/**
 * List available models for a provider, using the caller's own API key.
 * Used by the "fetch models" UI action — never persists the key.
 */
export async function listLlmModels(providerId: unknown, apiKey: unknown): Promise<Array<{ id: string; label?: string }>> {
  if (providerId !== 'openai' && providerId !== 'anthropic') {
    throw new Error('provider must be "openai" or "anthropic"');
  }
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('apiKey is required');
  }

  const provider = getLlmProvider(providerId);
  return provider.listModels(apiKey);
}

export async function analyzeLlmRequest(
  config: AppConfig,
  body: {
    analysisId?: unknown;
    focus?: unknown;
    useCache?: unknown;
    astOnlyMode?: unknown;
    provider?: unknown;
    apiKey?: unknown;
    model?: unknown;
    maxOutputTokens?: unknown;
    temperature?: unknown;
  }
): Promise<{ cached: boolean; result: string }> {
  const { analysisId, focus, useCache, astOnlyMode, provider, apiKey, model, maxOutputTokens, temperature } = body || {};
  if (!analysisId || typeof analysisId !== 'string') {
    throw new Error('analysisId is required');
  }
  if (!isValidAnalysisId(analysisId)) {
    throw new Error('analysisId is invalid');
  }

  if (!config.features.llm) {
    throw new Error('LLM is disabled. Set CSAP_LLM_ENABLED=true');
  }

  const providerId: LlmProviderId =
    provider === 'openai' || provider === 'anthropic' ? provider : config.llm.provider;
  const llmProvider = getLlmProvider(providerId);

  // A caller-supplied key (e.g. the VS Code extension, which stores it in VS Code's
  // SecretStorage rather than this process's environment) takes priority over the
  // server's own env var, so the same server can serve requests for different keys.
  const resolvedApiKey =
    typeof apiKey === 'string' && apiKey.trim()
      ? apiKey.trim()
      : process.env[resolveApiKeyEnvVar(providerId)];
  if (!resolvedApiKey) {
    throw new Error(`${resolveApiKeyEnvVar(providerId)} is not set`);
  }

  const analysisFocus = resolveAnalysisFocus(focus, astOnlyMode);
  const outputDir = config.paths.output;
  const contextPath = astOnlyMode
    ? getAstOnlyLlmContextPath(analysisId, outputDir)
    : getLlmContextPath(analysisId, outputDir);
  const resultPath = getLlmResultPath(analysisId, analysisFocus, outputDir);

  if (useCache && fs.existsSync(resultPath)) {
    const cached = JSON.parse(fs.readFileSync(resultPath, 'utf-8'));
    return { cached: true, result: cached.result || '' };
  }

  if (!fs.existsSync(contextPath)) {
    throw new Error(`LLM context not found (mode: ${astOnlyMode ? 'ast-only' : 'full'}). Re-run analysis.`);
  }

  const context = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
  const selectedModel = typeof model === 'string' && model.trim()
    ? model.trim()
    : (astOnlyMode ? config.llm.astOnlyModel : config.llm.model);
  const defaultMaxTokens = astOnlyMode ? config.llm.astOnlyMaxTokens : config.llm.maxTokens;
  const selectedMaxTokens = typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens)
    ? Math.max(200, Math.floor(maxOutputTokens))
    : defaultMaxTokens;
  const selectedTemperature = typeof temperature === 'number' && Number.isFinite(temperature)
    ? Math.min(2, Math.max(0, temperature))
    : config.llm.temperature;

  const llmOptions = {
    apiKey: resolvedApiKey,
    model: selectedModel,
    maxTokens: selectedMaxTokens,
    temperature: selectedTemperature,
  };
  const result = astOnlyMode
    ? await llmProvider.analyzeAstOnly(context, analysisFocus, llmOptions)
    : await llmProvider.analyzeFull(context, analysisFocus, llmOptions);

  const payload = {
    analysisId,
    focus: analysisFocus,
    mode: astOnlyMode ? 'ast-only' : 'full',
    provider: providerId,
    model: selectedModel,
    result,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(resultPath, JSON.stringify(payload, null, 2), 'utf-8');

  // Update the saved HTML report in-place so that offline viewing shows the latest result
  const divId = astOnlyMode ? 'llmAstResult' : 'llmResult';
  patchHtmlReport(analysisId, divId, result, outputDir);

  return { cached: false, result };
}

function resolveAnalysisFocus(focus: unknown, astOnlyMode: unknown): string {
  if (astOnlyMode) {
    return 'ast-structure-only';
  }

  if (typeof focus === 'string' && focus.trim()) {
    return focus;
  }

  return 'graph-metrics';
}
