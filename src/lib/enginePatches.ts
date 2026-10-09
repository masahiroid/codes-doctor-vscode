import { escapeReportSource } from './engine/reportEscaping';
const policy = require('./engine/policy');
import { patchDependencySource } from './dependencyPatches';
const { installJapaneseStrong } = require('./engine/support');

const strategies: Readonly<Record<string, (source: string) => string>> = Object.freeze({
  "llm/providers/openai.js": require('./engine/openaiResponses'),
  "report/htmlBuilder.js": require('./engine/reportHtml'),
  "services/llmService.js": require('./engine/llmPersistence'),
  "report/sections/astSection.js": require('./engine/astSection'),
  "graph/d3/visualizationScript.js": require('./engine/graphVisualization'),
  "report/sections/graphSections.js": require('./engine/graphSection'),
  "analyzer/securityScore.js": require('./engine/securityScore'),
  "llm/openai/prompts.js": require('./engine/reviewPrompts'),
});

export function patchEngineSource(source: string, relativePath: string) {
  const strategy = strategies[relativePath];
  source = source.replace(/require\(["']uuid["']\)/g, "({ v4: require('node:crypto').randomUUID })");
  const patched = strategy ? strategy(source) : source;
  const result = escapeReportSource(patchDependencySource(patched, relativePath), relativePath);
  return result.includes('CODE_DOCTOR_ENGINE_POLICY')
    ? `const CODE_DOCTOR_ENGINE_POLICY = ${JSON.stringify(policy)};\n${result}`
    : result;
}

module.exports = { patchEngineSource, installJapaneseStrong };
