"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLastAnalysis = setLastAnalysis;
exports.getLastAnalysis = getLastAnalysis;
/**
 * Tracks the most recent analysis result in memory (not persisted) so the
 * Dashboard can run an LLM review against it without re-running the analysis.
 * A single global slot is enough for this extension's single-dashboard UI.
 */
let lastAnalysis = null;
function setLastAnalysis(analysisId, outputDir, reportPath) {
    lastAnalysis = { analysisId, outputDir, reportPath };
}
function getLastAnalysis() {
    return lastAnalysis;
}
module.exports = {
    setLastAnalysis,
    getLastAnalysis,
};
