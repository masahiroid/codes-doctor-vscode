import { actionRules } from './promptRules';

module.exports = function patch(source: string) {
    // Both providers use these system prompts; keep the report's language and sections.
    source += `\nconst fullSystemPrompt = buildFullAnalysisSystemPrompt;\nconst astSystemPrompt = buildAstOnlySystemPrompt;\nexports.buildFullAnalysisSystemPrompt = () => fullSystemPrompt() + ${JSON.stringify('\n' + actionRules)};\nexports.buildAstOnlySystemPrompt = () => astSystemPrompt() + ${JSON.stringify('\n' + actionRules)};\n`;

  return source;
};

export {};
