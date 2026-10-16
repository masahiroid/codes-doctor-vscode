"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setLastAnalysis = setLastAnalysis;
exports.getLastAnalysis = getLastAnalysis;
exports.onLastAnalysisChanged = onLastAnalysisChanged;
/**
 * Tracks the most recent analysis result in memory (not persisted) so the
 * Dashboard, Diagnostics, Hover, Status Bar, and Findings Tree can access it.
 */
let lastAnalysis = null;
const listeners = new Set();
function setLastAnalysis(analysisId, outputDir, reportPath, summary, result) {
    if (!analysisId || !outputDir) {
        lastAnalysis = null;
    }
    else {
        lastAnalysis = { analysisId, outputDir, reportPath, summary, result };
    }
    for (const listener of listeners) {
        try {
            listener(lastAnalysis);
        }
        catch {
            // Ignore listener errors so other subscribers still receive updates.
        }
    }
}
function getLastAnalysis() {
    return lastAnalysis;
}
function onLastAnalysisChanged(listener) {
    listeners.add(listener);
    return {
        dispose: () => {
            listeners.delete(listener);
        },
    };
}
module.exports = {
    setLastAnalysis,
    getLastAnalysis,
    onLastAnalysisChanged,
};
