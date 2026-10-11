import type { LlmMode } from '../llm/focus';

/** Report element that displays each LLM mode's output (`data-md` holds the Markdown source). */
export const REVIEW_ELEMENT_IDS: Readonly<Record<LlmMode, string>> = Object.freeze({
  full: 'llmResult',
  'ast-only': 'astResult',
  'agent-prompt': 'llmAgentPrompt',
});
