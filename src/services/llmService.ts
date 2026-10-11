import { getLlmProvider, type LlmCallOptions, type LlmProvider } from '../llm/providers';
import { readLlmContext, readLlmResult, writeLlmResult } from '../llm/artifacts';
import { updateReportReview } from '../report/liveUpdate';
import type { LlmRun } from '../llm/focus';
import type { AppConfig } from '../types';
import { isLlmProviderId, LlmRequestBody, resolveLlmRequest } from './llmRequest';

export function getSavedLlmResult(
  analysisId: string,
  focus: string,
  outputDir?: string
): { result: string; createdAt?: string; mode?: string } | null {
  const payload = readLlmResult(analysisId, focus, outputDir);
  if (!payload) return null;
  return { result: payload.result || '', createdAt: payload.createdAt, mode: payload.mode };
}

/**
 * List available models for a provider, using the caller's own API key.
 * Used by the "fetch models" UI action — never persists the key.
 */
export async function listLlmModels(providerId: unknown, apiKey: unknown): Promise<Array<{ id: string; label?: string }>> {
  if (!isLlmProviderId(providerId)) {
    throw new Error('provider must be "openai" or "anthropic"');
  }
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('apiKey is required');
  }
  return getLlmProvider(providerId).listModels(apiKey);
}

/** Run (or reuse) an LLM analysis, save it next to the report, and update the saved report. */
export async function analyzeLlmRequest(config: AppConfig, body: LlmRequestBody): Promise<{ cached: boolean; result: string }> {
  const request = resolveLlmRequest(config, body);
  const { analysisId, run, options } = request;
  const outputDir = config.paths.output;

  if (request.useCache) {
    const cached = readLlmResult(analysisId, run.focus, outputDir);
    if (cached) return { cached: true, result: cached.result || '' };
  }

  const context = readLlmContext(analysisId, run.mode, outputDir);
  const result = await generate(getLlmProvider(request.providerId), run, context, options);

  writeLlmResult({
    analysisId,
    focus: run.focus,
    mode: run.mode,
    provider: request.providerId,
    model: options.model,
    result,
    createdAt: new Date().toISOString(),
  }, outputDir);
  updateReportReview(analysisId, run.mode, result, outputDir);

  return { cached: false, result };
}

function generate(provider: LlmProvider, run: LlmRun, context: any, options: LlmCallOptions): Promise<string> {
  switch (run.mode) {
    case 'ast-only':
      return provider.analyzeAstOnly(context, run.focus, options);
    case 'agent-prompt':
      return provider.generateAgentPrompt(context, options);
    default:
      return provider.analyzeFull(context, run.focus, options);
  }
}
