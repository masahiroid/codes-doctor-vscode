import https from 'node:https';
import { loadEngine } from './engine';
import { getLlmProvider, getLlmModel } from './config';
import { getApiKey } from './secrets';

export interface VsCodeLmModelEntry {
  id: string;
  label?: string;
}

/**
 * List available chat models exposed by VS Code's built-in Language Model API (`vscode.lm`),
 * such as GitHub Copilot models, without requiring any external API key.
 */
export async function listVsCodeLmModels(vscode: typeof import('vscode')): Promise<VsCodeLmModelEntry[]> {
  const lm = (vscode as unknown as { lm?: { selectChatModels?: (selector?: Record<string, string>) => Promise<Array<{ id: string; name?: string; vendor?: string; family?: string }>> } }).lm;
  if (!lm || typeof lm.selectChatModels !== 'function') {
    throw new Error('VS Code Language Model API (vscode.lm) is not available in this editor.');
  }
  const models = await lm.selectChatModels({});
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('No VS Code language models found. Make sure GitHub Copilot Chat or another language model extension is signed in.');
  }
  return models.map((m) => ({
    id: m.id,
    label: [m.name || m.id, m.vendor ? `[${m.vendor}]` : ''].filter(Boolean).join(' '),
  }));
}

/**
 * Send a prompt using VS Code's `vscode.lm` API and collect the full response text.
 */
export async function sendVsCodeLmPrompt(
  vscode: typeof import('vscode'),
  prompt: string,
  requestedModelId?: string,
  token?: import('vscode').CancellationToken
): Promise<{ text: string; modelId: string }> {
  const anyVscode = vscode as unknown as {
    lm?: {
      selectChatModels?: (selector?: Record<string, string>) => Promise<
        Array<{
          id: string;
          name?: string;
          sendRequest: (
            messages: unknown[],
            options?: Record<string, unknown>,
            token?: unknown
          ) => Promise<{ text: AsyncIterable<string> }>;
        }>
      >;
    };
    LanguageModelChatMessage?: {
      User: (content: string) => unknown;
    };
  };

  if (!anyVscode.lm || typeof anyVscode.lm.selectChatModels !== 'function') {
    throw new Error('VS Code Language Model API (vscode.lm) is not available in this editor.');
  }

  let models = requestedModelId
    ? await anyVscode.lm.selectChatModels({ id: requestedModelId })
    : [];
  if (!models || models.length === 0) {
    models = await anyVscode.lm.selectChatModels({});
  }
  if (!models || models.length === 0) {
    throw new Error('No VS Code language models available. Sign in to GitHub Copilot or switch LLM Provider to OpenAI / Anthropic.');
  }

  const chosen = (requestedModelId && models.find((m) => m.id === requestedModelId)) || models[0];
  const userMessage = anyVscode.LanguageModelChatMessage?.User
    ? anyVscode.LanguageModelChatMessage.User(prompt)
    : { role: 'user', content: prompt };

  const response = await chosen.sendRequest([userMessage], {}, token);
  let text = '';
  for await (const chunk of response.text) {
    text += chunk;
  }
  return { text: text.trim(), modelId: chosen.id };
}

/**
 * Run a full structural review or AI coding agent prompt using `vscode.lm`
 * and patch the saved HTML report in place.
 */
export async function runVsCodeLmReview(
  vscode: typeof import('vscode'),
  params: {
    analysisId: string;
    outputDir: string;
    model?: string;
    focus?: string;
    astOnlyMode?: boolean;
    displayLanguage?: 'en' | 'ja';
  }
): Promise<{ cached: boolean; result: string; modelId: string }> {
  const engine = loadEngine(params.displayLanguage === 'ja' ? 'ja' : 'en');
  const { mode, focus, systemPrompt, userPrompt } = engine.buildLlmPromptMessages(params.analysisId, {
    focus: params.focus,
    astOnlyMode: params.astOnlyMode,
    outputDir: params.outputDir,
  });

  const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const { text, modelId } = await sendVsCodeLmPrompt(vscode, combinedPrompt, params.model);

  engine.saveExternalLlmResult(
    {
      analysisId: params.analysisId,
      focus,
      mode,
      provider: 'vscode-lm',
      model: modelId,
      result: text,
    },
    params.outputDir
  );

  return { cached: false, result: text, modelId };
}

function callHttpJson(
  host: string,
  path: string,
  headers: Record<string, string>,
  bodyObj: unknown
): Promise<Record<string, unknown>> {
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        path,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`API error (${res.statusCode}): ${data}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Failed to parse JSON response'));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Send an ad-hoc prompt (used by `@codedoctor` Chat Participant and 1-click AI Fix Preview)
 * using either `vscode.lm` or the configured OpenAI / Anthropic API key.
 */
export async function generateAdHocAiResponse(
  vscode: typeof import('vscode'),
  context: Pick<import('vscode').ExtensionContext, 'secrets'>,
  prompt: string,
  token?: import('vscode').CancellationToken
): Promise<{ text: string; providerLabel: string }> {
  const provider = getLlmProvider(vscode);
  const configuredModel = getLlmModel(vscode);

  if (provider === 'vscode-lm') {
    const res = await sendVsCodeLmPrompt(vscode, prompt, configuredModel || undefined, token);
    return { text: res.text, providerLabel: `vscode-lm (${res.modelId})` };
  }

  const apiKey = await getApiKey(context, provider);
  if (!apiKey) {
    // Fallback to vscode.lm if available when no API key is configured
    try {
      const res = await sendVsCodeLmPrompt(vscode, prompt, undefined, token);
      return { text: res.text, providerLabel: `vscode-lm (${res.modelId})` };
    } catch {
      throw new Error(
        `No API key set for ${provider}, and VS Code built-in AI (vscode.lm) is not available.`
      );
    }
  }

  if (provider === 'anthropic') {
    const model = configuredModel || 'claude-sonnet-4-20250514';
    const json = await callHttpJson(
      'api.anthropic.com',
      '/v1/messages',
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      {
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }
    );
    const content = Array.isArray(json.content) ? json.content : [];
    const text = content
      .map((item: { type?: string; text?: string }) => (item?.type === 'text' ? item.text || '' : ''))
      .join('\n')
      .trim();
    return { text, providerLabel: `anthropic (${model})` };
  }

  const model = configuredModel || 'gpt-4o';
  const json = await callHttpJson(
    'api.openai.com',
    '/v1/chat/completions',
    {
      Authorization: `Bearer ${apiKey}`,
    },
    {
      model,
      messages: [{ role: 'user', content: prompt }],
    }
  );
  const choices = Array.isArray(json.choices) ? json.choices : [];
  const first = choices[0] as { message?: { content?: string } } | undefined;
  const text = (first?.message?.content || '').trim();
  return { text, providerLabel: `openai (${model})` };
}

module.exports = {
  listVsCodeLmModels,
  sendVsCodeLmPrompt,
  runVsCodeLmReview,
  generateAdHocAiResponse,
};

