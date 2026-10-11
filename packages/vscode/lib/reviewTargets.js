"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_PROMPT_TARGET_ID = exports.REVIEW_TARGET_IDS = void 0;
exports.isReviewTargetId = isReviewTargetId;
/** Report elements whose Markdown can be copied for an AI agent. */
exports.REVIEW_TARGET_IDS = Object.freeze(['llmResult', 'astResult', 'llmAgentPrompt']);
/** The agent prompt is already an instruction, so it is copied without the generic preamble. */
exports.AGENT_PROMPT_TARGET_ID = 'llmAgentPrompt';
function isReviewTargetId(value) {
    return typeof value === 'string' && exports.REVIEW_TARGET_IDS.includes(value);
}
module.exports = { REVIEW_TARGET_IDS: exports.REVIEW_TARGET_IDS, AGENT_PROMPT_TARGET_ID: exports.AGENT_PROMPT_TARGET_ID, isReviewTargetId };
