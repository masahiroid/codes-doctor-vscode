import { LlmContext, AstOnlyLlmContext } from '../context';

export type LlmProviderId = 'openai' | 'anthropic';

export const LLM_PROVIDER_IDS: LlmProviderId[] = ['openai', 'anthropic'];

export interface LlmCallOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface LlmModelInfo {
  id: string;
  /** Human-readable label, if the provider's API gives one richer than the id */
  label?: string;
}

/**
 * One implementation per LLM provider (OpenAI, Anthropic, ...). Each provider
 * owns its own HTTP wire format and prompt-building conventions, but exposes
 * the same shape so callers (llmService.ts, the VS Code extension) don't need
 * to branch on provider.
 */
export interface LlmProvider {
  id: LlmProviderId;
  displayName: string;
  /** Fetch the live list of models this API key can use, newest/most relevant first. */
  listModels(apiKey: string): Promise<LlmModelInfo[]>;
  analyzeFull(context: LlmContext, focus: string, options: LlmCallOptions): Promise<string>;
  analyzeAstOnly(context: AstOnlyLlmContext, focus: string, options: LlmCallOptions): Promise<string>;
}
