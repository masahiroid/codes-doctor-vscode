import type { AppConfig } from '../types';
import type { LlmProviderId } from '../llm/providers';
import { LlmRun, resolveLlmRun } from '../llm/focus';
import { isValidAnalysisId } from '../validation';

/** Smallest output budget accepted from a caller; below this a review cannot complete. */
const MIN_OUTPUT_TOKENS = 200;
/** Sampling temperature range accepted by both providers. */
const TEMPERATURE_RANGE = { min: 0, max: 2 } as const;

const PROVIDER_API_KEY_ENV: Record<LlmProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/** Untrusted request body of an LLM analysis call. */
export interface LlmRequestBody {
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

/** A validated LLM request with every option resolved against the server config. */
export interface LlmRequest {
  analysisId: string;
  run: LlmRun;
  useCache: boolean;
  providerId: LlmProviderId;
  options: { apiKey: string; model: string; maxTokens: number; temperature: number };
}

export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return typeof value === 'string' && value in PROVIDER_API_KEY_ENV;
}

export function resolveLlmRequest(config: AppConfig, body: LlmRequestBody | undefined): LlmRequest {
  const { analysisId, focus, useCache, astOnlyMode, provider, apiKey, model, maxOutputTokens, temperature } = body || {};
  if (!analysisId || typeof analysisId !== 'string') {
    throw new Error('analysisId is required');
  }
  if (!isValidAnalysisId(analysisId)) {
    throw new Error('analysisId is invalid');
  }

  const providerId: LlmProviderId = isLlmProviderId(provider) ? provider : config.llm.provider;
  const run = resolveLlmRun(focus, astOnlyMode);
  const astOnly = run.mode === 'ast-only';
  return {
    analysisId,
    run,
    useCache: Boolean(useCache),
    providerId,
    options: {
      apiKey: resolveApiKey(config, providerId, apiKey),
      model: typeof model === 'string' && model.trim() ? model.trim() : (astOnly ? config.llm.astOnlyModel : config.llm.model),
      maxTokens: typeof maxOutputTokens === 'number' && Number.isFinite(maxOutputTokens)
        ? Math.max(MIN_OUTPUT_TOKENS, Math.floor(maxOutputTokens))
        : (astOnly ? config.llm.astOnlyMaxTokens : config.llm.maxTokens),
      temperature: typeof temperature === 'number' && Number.isFinite(temperature)
        ? Math.min(TEMPERATURE_RANGE.max, Math.max(TEMPERATURE_RANGE.min, temperature))
        : config.llm.temperature,
    },
  };
}

/**
 * A caller-supplied key (e.g. the report UI or the VS Code extension, both of which hold
 * the key client-side) takes priority over the server's own env var. CSAP_LLM_ENABLED only
 * gates the fallback to the server's key; a request carrying its own key is always allowed,
 * since the caller is spending their own API quota, not the server's.
 */
function resolveApiKey(config: AppConfig, providerId: LlmProviderId, apiKey: unknown): string {
  const callerSuppliedApiKey = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : undefined;
  if (callerSuppliedApiKey) return callerSuppliedApiKey;
  if (!config.features.llm) {
    throw new Error('LLM is disabled. Set CSAP_LLM_ENABLED=true, or supply an API key with the request.');
  }
  const envVar = PROVIDER_API_KEY_ENV[providerId];
  const serverApiKey = process.env[envVar];
  if (!serverApiKey) {
    throw new Error(`${envVar} is not set`);
  }
  return serverApiKey;
}
