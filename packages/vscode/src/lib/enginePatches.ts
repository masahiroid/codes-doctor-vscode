const policy = require('./engine/policy');
const { installJapaneseStrong } = require('./engine/support');

const strategies: Readonly<Record<string, (source: string) => string>> = Object.freeze({
  "report/htmlBuilder.js": require('./engine/reportHtml'),
  "report/liveUpdate.js": require('./engine/llmPersistence'),
  "report/sections/astSection.js": require('./engine/astSection'),
  "report/sections/ast/limits.js": require('./engine/astLimits'),
  "report/sections/ast/structureOutline.js": require('./engine/astRendering').localizeAstLabels,
  "report/sections/ast/typescriptStructure.js": require('./engine/astRendering').localizeAstLabels,
  "report/sections/ast/phpStructure.js": require('./engine/astRendering').localizeAstLabels,
  "report/sections/ast/lightweightStructure.js": require('./engine/astRendering').localizeAstLabels,
  "graph/d3/visualizationScript.js": require('./engine/graphVisualization'),
  "report/sections/graphSections.js": require('./engine/graphSection'),
});

export function patchEngineSource(source: string, relativePath: string) {
  const strategy = strategies[relativePath];
  source = source.replace(/require\(["']uuid["']\)/g, "({ v4: require('node:crypto').randomUUID })");
  const patched = strategy ? strategy(source) : source;
  const result = patched;
  return result.includes('CODE_DOCTOR_ENGINE_POLICY')
    ? `const CODE_DOCTOR_ENGINE_POLICY = ${JSON.stringify(policy)};\n${result}`
    : result;
}

module.exports = { patchEngineSource, installJapaneseStrong };
