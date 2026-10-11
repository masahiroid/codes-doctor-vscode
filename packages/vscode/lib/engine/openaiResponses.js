"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const policy = require('./policy');
const sourceReplacement_1 = require("./sourceReplacement");
module.exports = function patch(source) {
    source = (0, sourceReplacement_1.replaceRequired)(source, "includeTemperature = true)", "includeTemperature = true, retriedEmpty = false)");
    source = source.replaceAll("'max_completion_tokens', includeTemperature)", "'max_completion_tokens', includeTemperature, retriedEmpty)");
    source = source.replaceAll("tokenParamName, false)", "tokenParamName, false, retriedEmpty)");
    const start = source.indexOf('    if (!response.choices?.[0]?.message?.content)');
    const end = source.indexOf('\n}', start);
    if (start < 0 || end < 0)
        throw new Error('OpenAI chat response marker missing');
    source = source.slice(0, start) + `    const choice = response.choices?.[0];
    const text = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
    if (text) return text;
    if (choice?.message?.refusal) throw new Error('OpenAI declined the review request. Try a different review scope.');
    if (choice?.finish_reason === 'length') {
        if (!retriedEmpty) return callChatCompletions(systemPrompt, userPrompt, { ...options, maxTokens: Math.max(options.maxTokens * ${policy.reviewRetry.tokenMultiplier}, ${policy.reviewRetry.minimumTokens}) }, tokenParamName, includeTemperature, true);
        throw new Error('OpenAI review exhausted the token budget before producing text (model: ' + options.model + ', limit: ' + options.maxTokens + '). Increase Codes Doctor: Llm Max Output Tokens in settings or choose another model.');
    }
    throw new Error('OpenAI Chat Completions response missing content (model: ' + options.model + ', finish_reason: ' + (choice?.finish_reason ?? 'unknown') + ')');` + source.slice(end);
    source = (0, sourceReplacement_1.replaceRequired)(source, 'async function callResponsesApi(systemPrompt, userPrompt, options)', 'async function callResponsesApi(systemPrompt, userPrompt, options, retriedEmpty = false)');
    const responsesStart = source.indexOf('    const text = response.output?.[0]?.content?.[0]?.text;');
    const responsesEnd = source.indexOf('\n}', responsesStart);
    if (responsesStart < 0 || responsesEnd < 0)
        throw new Error('OpenAI Responses output marker missing');
    source = source.slice(0, responsesStart) + `    const content = (response.output ?? []).filter(item => item.type === 'message').flatMap(item => item.content ?? []);
    const text = content.filter(part => part.type === 'output_text' && typeof part.text === 'string').map(part => part.text).join('\\n').trim();
    if (text) return text;
    if (content.some(part => part.type === 'refusal')) throw new Error('OpenAI declined the review request. Try a different review scope.');
    if (response.incomplete_details?.reason === 'max_output_tokens') {
        if (!retriedEmpty) return callResponsesApi(systemPrompt, userPrompt, { ...options, maxTokens: Math.max(options.maxTokens * ${policy.reviewRetry.tokenMultiplier}, ${policy.reviewRetry.minimumTokens}) }, true);
        throw new Error('OpenAI review exhausted the token budget before producing text (model: ' + options.model + ', limit: ' + options.maxTokens + '). Increase Codes Doctor: Llm Max Output Tokens in settings or choose another model.');
    }
    throw new Error('OpenAI Responses API: missing output text (model: ' + options.model + ', status: ' + (response.status ?? 'unknown') + ', reason: ' + (response.incomplete_details?.reason ?? response.error?.code ?? 'unknown') + ')');` + source.slice(responsesEnd);
    return source;
};
