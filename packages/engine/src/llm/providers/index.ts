import { LlmProvider, LlmProviderId, LLM_PROVIDER_IDS } from './types';
import { openAiProvider } from './openai';
import { anthropicProvider } from './anthropic';

export type { LlmProvider, LlmProviderId, LlmCallOptions, LlmModelInfo } from './types';
export { LLM_PROVIDER_IDS } from './types';

const PROVIDERS: Record<LlmProviderId, LlmProvider> = {
  openai: openAiProvider,
  anthropic: anthropicProvider,
};

export function getLlmProvider(id: LlmProviderId): LlmProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${id}. Valid providers: ${LLM_PROVIDER_IDS.join(', ')}`);
  }
  return provider;
}

export function listLlmProviders(): LlmProvider[] {
  return LLM_PROVIDER_IDS.map((id) => PROVIDERS[id]);
}
