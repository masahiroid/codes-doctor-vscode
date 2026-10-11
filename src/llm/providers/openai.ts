import https from 'node:https';
import { LlmContext, AstOnlyLlmContext } from '../context';
import { LlmProvider, LlmCallOptions, LlmModelInfo } from './types';
import {
  buildFullAnalysisSystemPrompt,
  buildFullAnalysisPrompt,
  buildAstOnlySystemPrompt,
  buildAstOnlyPrompt,
  buildAgentPromptSystemPrompt,
  buildAgentPromptUserPrompt,
} from '../openai/prompts';

const OPENAI_API_HOST = 'api.openai.com';
const CLIENT_ERROR_STATUS_THRESHOLD = 400;

/** Slightly higher temperature floor for AST-only analysis, for more detailed output */
const AST_ONLY_MIN_TEMPERATURE = 0.5;

/** Fallback model IDs, keyed by normalized (trimmed, lowercased) requested model name.
 * Covers stale aliases that may still be requested by older saved settings. Less load-bearing
 * now that listModels() lets callers pick a real model ID directly from the live API. */
const MODEL_ALIASES: Record<string, string[]> = {
  'gpt-5.3': ['gpt-5.3-chat', 'gpt-5.4', 'gpt-5'],
  'gpt-5-4-auto-thinking': ['gpt-5.4', 'gpt-5.3-chat', 'gpt-5'],
  'gpt-5.4 pro': ['gpt-5.4', 'gpt-5.3-chat', 'gpt-5'],
  'gpt-5.3 chat': ['gpt-5.3-chat', 'gpt-5.4', 'gpt-5'],
  'gpt-5.4': ['gpt-5.3-chat', 'gpt-5'],
  'gpt-5.3-chat': ['gpt-5.4', 'gpt-5'],
};

function getModelFallbackCandidates(model: string): string[] {
  const normalized = model.trim().toLowerCase();
  const candidates = [model.trim(), ...(MODEL_ALIASES[normalized] ?? [])];
  return Array.from(new Set(candidates));
}

function isModelNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('model_not_found');
}

/** Newer models (o1/o3/o4, gpt-5 chat variants, etc.) reject `max_tokens` on
 * /v1/chat/completions and require `max_completion_tokens` instead. */
function isUnsupportedMaxTokensError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('unsupported_parameter') && error.message.includes('max_tokens');
}

/** Some reasoning models (o1/o3/o4, some gpt-5 variants) only support the default
 * temperature (1) and reject any explicit value — including 1 itself, on some models. */
function isUnsupportedTemperatureError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes('unsupported_value') && error.message.includes('temperature');
}

/** GPT-5 series uses the Responses API (/v1/responses) instead of Chat Completions */
function isResponsesApiModel(model: string): boolean {
  return /^gpt-5/.test(model);
}

function httpRequest(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  body?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }

    const req = https.request(
      { host: OPENAI_API_HOST, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= CLIENT_ERROR_STATUS_THRESHOLD) {
            return reject(new Error(`OpenAI API error (${res.statusCode}): ${data}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Failed to parse OpenAI response'));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

function httpPostJson(path: string, body: string, apiKey: string): Promise<any> {
  return httpRequest('POST', path, apiKey, body);
}

async function listModels(apiKey: string): Promise<LlmModelInfo[]> {
  const response = await httpRequest('GET', '/v1/models', apiKey);
  const models: Array<{ id: string }> = response?.data ?? [];
  // Only chat/reasoning-capable text models are relevant here; exclude embeddings,
  // moderation, TTS/whisper, and image models the API also lists.
  const EXCLUDE_PATTERN = /embedding|moderation|whisper|tts|dall-e|davinci-002|babbage/i;
  return models
    .map((m) => m.id)
    .filter((id) => !EXCLUDE_PATTERN.test(id))
    .sort((a, b) => b.localeCompare(a))
    .map((id) => ({ id }));
}

async function callChatCompletions(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions,
  tokenParamName: 'max_tokens' | 'max_completion_tokens' = 'max_tokens',
  includeTemperature = true
): Promise<string> {
  const payload = JSON.stringify({
    model: options.model,
    ...(includeTemperature ? { temperature: options.temperature } : {}),
    [tokenParamName]: options.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let response;
  try {
    response = await httpPostJson('/v1/chat/completions', payload, options.apiKey);
  } catch (error) {
    // Retry once with the other token-limit parameter name, or without temperature, if the
    // API rejected this request on one of those params — which params a model accepts isn't
    // predictable from the model ID alone across providers' ongoing API changes, so probing
    // is more reliable than a hardcoded model-name list.
    if (tokenParamName === 'max_tokens' && isUnsupportedMaxTokensError(error)) {
      return callChatCompletions(systemPrompt, userPrompt, options, 'max_completion_tokens', includeTemperature);
    }
    if (includeTemperature && isUnsupportedTemperatureError(error)) {
      return callChatCompletions(systemPrompt, userPrompt, options, tokenParamName, false);
    }
    throw error;
  }

  if (!response.choices?.[0]?.message?.content) {
    throw new Error('OpenAI Chat Completions response missing content');
  }
  return response.choices[0].message.content.trim();
}

async function callResponsesApi(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions
): Promise<string> {
  // GPT-5 Responses API: instructions = system role, input = user messages
  const payload = JSON.stringify({
    model: options.model,
    instructions: systemPrompt,
    input: [{ role: 'user', content: userPrompt }],
    max_output_tokens: options.maxTokens,
  });
  const response = await httpPostJson('/v1/responses', payload, options.apiKey);
  // Responses API: { output: [{ content: [{ type: 'output_text', text: '...' }] }] }
  const text = response.output?.[0]?.content?.[0]?.text;
  if (!text) {
    throw new Error('OpenAI Responses API: missing output text');
  }
  return text.trim();
}

async function callLlm(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions
): Promise<string> {
  const modelCandidates = getModelFallbackCandidates(options.model);
  let lastError: unknown;

  for (const model of modelCandidates) {
    const currentOptions = { ...options, model };
    try {
      if (isResponsesApiModel(model)) {
        return await callResponsesApi(systemPrompt, userPrompt, currentOptions);
      }
      return await callChatCompletions(systemPrompt, userPrompt, currentOptions);
    } catch (error) {
      lastError = error;
      if (!isModelNotFoundError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`No valid model found for requested model: ${options.model}`);
}

export const openAiProvider: LlmProvider = {
  id: 'openai',
  displayName: 'OpenAI',

  listModels,

  async analyzeFull(context: LlmContext, focus: string, options: LlmCallOptions): Promise<string> {
    return callLlm(buildFullAnalysisSystemPrompt(), buildFullAnalysisPrompt(context, focus), options);
  },

  async analyzeAstOnly(
    context: AstOnlyLlmContext,
    focus: string,
    options: LlmCallOptions
  ): Promise<string> {
    // AST-only analysis uses caller-provided token budget so experiments can tune cost/quality.
    const astOnlyOptions: LlmCallOptions = {
      ...options,
      temperature: Math.max(options.temperature, AST_ONLY_MIN_TEMPERATURE),
    };
    return callLlm(buildAstOnlySystemPrompt(), buildAstOnlyPrompt(context, focus), astOnlyOptions);
  },

  async generateAgentPrompt(context: LlmContext, options: LlmCallOptions): Promise<string> {
    return callLlm(buildAgentPromptSystemPrompt(), buildAgentPromptUserPrompt(context), options);
  },
};
