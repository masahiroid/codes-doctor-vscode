/** Analysis focus IDs; each names a saved LLM result (`<analysisId>.llm-<focus>.json`). */
export const LLM_FOCUS = Object.freeze({
  /** Default full structural review. */
  review: 'graph-metrics',
  /** Review built only from the AST section's structure samples. */
  astOnly: 'ast-structure-only',
  /** Ready-to-paste task prompt for an AI coding agent. */
  agentPrompt: 'agent-prompt',
} as const);

/** What an LLM run produces: a full review, an AST-only review, or an agent task prompt. */
export type LlmMode = 'full' | 'ast-only' | 'agent-prompt';

export interface LlmRun {
  mode: LlmMode;
  focus: string;
}

/** Resolve the request's focus and AST-only flag into the run to perform. */
export function resolveLlmRun(focus: unknown, astOnlyMode: unknown): LlmRun {
  if (astOnlyMode) return { mode: 'ast-only', focus: LLM_FOCUS.astOnly };
  const resolvedFocus = typeof focus === 'string' && focus.trim() ? focus : LLM_FOCUS.review;
  return { mode: resolvedFocus === LLM_FOCUS.agentPrompt ? 'agent-prompt' : 'full', focus: resolvedFocus };
}
