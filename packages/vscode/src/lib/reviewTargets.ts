/** Report elements whose Markdown can be copied for an AI agent. */
export const REVIEW_TARGET_IDS = Object.freeze(['llmResult', 'astResult', 'llmAgentPrompt'] as const);
/** The agent prompt is already an instruction, so it is copied without the generic preamble. */
export const AGENT_PROMPT_TARGET_ID = 'llmAgentPrompt';

export function isReviewTargetId(value: unknown): value is (typeof REVIEW_TARGET_IDS)[number] {
  return typeof value === 'string' && (REVIEW_TARGET_IDS as readonly string[]).includes(value);
}

module.exports = { REVIEW_TARGET_IDS, AGENT_PROMPT_TARGET_ID, isReviewTargetId };
