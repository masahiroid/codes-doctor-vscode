"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchEngineSource = patchEngineSource;
const reportEscaping_1 = require("./engine/reportEscaping");
const policy = require('./engine/policy');
const dependencyPatches_1 = require("./dependencyPatches");
const { installJapaneseStrong } = require('./engine/support');
const strategies = Object.freeze({
    "llm/providers/openai.js": require('./engine/openaiResponses'),
    "report/htmlBuilder.js": require('./engine/reportHtml'),
    "services/llmService.js": require('./engine/llmPersistence'),
    "report/sections/astSection.js": require('./engine/astSection'),
    "graph/d3/visualizationScript.js": require('./engine/graphVisualization'),
    "report/sections/graphSections.js": require('./engine/graphSection'),
    "analyzer/securityScore.js": require('./engine/securityScore'),
    "llm/openai/prompts.js": require('./engine/reviewPrompts'),
});
function patchEngineSource(source, relativePath) {
    const strategy = strategies[relativePath];
    source = source.replace(/require\(["']uuid["']\)/g, "({ v4: require('node:crypto').randomUUID })");
    const patched = strategy ? strategy(source) : source;
    const result = (0, reportEscaping_1.escapeReportSource)((0, dependencyPatches_1.patchDependencySource)(patched, relativePath), relativePath);
    return result.includes('CODE_DOCTOR_ENGINE_POLICY')
        ? `const CODE_DOCTOR_ENGINE_POLICY = ${JSON.stringify(policy)};\n${result}`
        : result;
}
module.exports = { patchEngineSource, installJapaneseStrong };
