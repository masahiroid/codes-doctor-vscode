"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promptRules_1 = require("./promptRules");
module.exports = function patch(source) {
    // Both providers use these system prompts; keep the report's language and sections.
    source += `\nconst fullSystemPrompt = buildFullAnalysisSystemPrompt;\nconst astSystemPrompt = buildAstOnlySystemPrompt;\nexports.buildFullAnalysisSystemPrompt = () => fullSystemPrompt() + ${JSON.stringify('\n' + promptRules_1.actionRules)};\nexports.buildAstOnlySystemPrompt = () => astSystemPrompt() + ${JSON.stringify('\n' + promptRules_1.actionRules)};\n`;
    return source;
};
