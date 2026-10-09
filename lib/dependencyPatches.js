"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchDependencySource = patchDependencySource;
const strategies = Object.freeze({
    "analyzer/typescript/ast.js": require('./engine/staticImports'),
    "analyzer/moduleMetrics.js": require('./engine/moduleMetrics'),
    "llm/context/moduleMetricsContext.js": require('./engine/moduleClassification'),
    "llm/context/dependencyGraphContext.js": require('./engine/dependencyContext'),
    "analyzer/pipeline/qualityAnalysis.js": require('./engine/qualityPipeline'),
    "analyzer/layerAnalysis.js": require('./engine/layerClassification'),
});
function patchDependencySource(source, relativePath) {
    const strategy = strategies[relativePath];
    if (!strategy)
        return source;
    try {
        return strategy(source);
    }
    catch (error) {
        throw new Error(`${relativePath}: ${(error instanceof Error ? error.message : String(error))}`, { cause: error });
    }
}
module.exports = { patchDependencySource };
