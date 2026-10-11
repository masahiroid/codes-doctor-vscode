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

const ANTHROPIC_API_HOST = 'api.anthropic.com';
const ANTHROPIC_API_VERSION = '2023-06-01';
const CLIENT_ERROR_STATUS_THRESHOLD = 400;

function httpRequest(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  body?: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(body));
    }

    const req = https.request(
      { host: ANTHROPIC_API_HOST, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= CLIENT_ERROR_STATUS_THRESHOLD) {
            return reject(new Error(`Anthropic API error (${res.statusCode}): ${data}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Failed to parse Anthropic response'));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Known model IDs as of this codebase's last update, used only if the live
 * /v1/models call fails (e.g. transient network error) — listModels() always
 * tries the real API first so new models show up without a code change.
 */
const KNOWN_MODEL_FALLBACK: LlmModelInfo[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
];

async function listModels(apiKey: string): Promise<LlmModelInfo[]> {
  try {
    const response = await httpRequest('GET', '/v1/models?limit=100', apiKey);
    const models: Array<{ id: string; display_name?: string }> = response?.data ?? [];
    if (models.length === 0) {
      return KNOWN_MODEL_FALLBACK;
    }
    return models.map((m) => ({ id: m.id, label: m.display_name }));
  } catch {
    return KNOWN_MODEL_FALLBACK;
  }
}

async function callMessagesApi(
  systemPrompt: string,
  userPrompt: string,
  options: LlmCallOptions
): Promise<string> {
  const payload = JSON.stringify({
    model: options.model,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  const response = await httpRequest('POST', '/v1/messages', options.apiKey, payload);
  const text = response?.content?.[0]?.text;
  if (!text) {
    throw new Error('Anthropic Messages API response missing content');
  }
  return text.trim();
}

export const anthropicProvider: LlmProvider = {
  id: 'anthropic',
  displayName: 'Anthropic (Claude)',

  listModels,

  async analyzeFull(context: LlmContext, focus: string, options: LlmCallOptions): Promise<string> {
    return callMessagesApi(buildFullAnalysisSystemPrompt(), buildFullAnalysisPrompt(context, focus), options);
  },

  async analyzeAstOnly(
    context: AstOnlyLlmContext,
    focus: string,
    options: LlmCallOptions
  ): Promise<string> {
    return callMessagesApi(buildAstOnlySystemPrompt(), buildAstOnlyPrompt(context, focus), options);
  },

  async generateAgentPrompt(context: LlmContext, options: LlmCallOptions): Promise<string> {
    return callMessagesApi(buildAgentPromptSystemPrompt(), buildAgentPromptUserPrompt(context), options);
  },
};
