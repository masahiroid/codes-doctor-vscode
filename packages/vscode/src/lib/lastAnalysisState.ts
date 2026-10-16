/**
 * Tracks the most recent analysis result in memory (not persisted) so the
 * Dashboard, Diagnostics, Hover, Status Bar, and Findings Tree can access it.
 */
let lastAnalysis: import('./types').AnalysisReference | null = null;
type AnalysisListener = (analysis: import('./types').AnalysisReference | null) => void;
const listeners = new Set<AnalysisListener>();

export function setLastAnalysis(
  analysisId?: string,
  outputDir?: string,
  reportPath?: string,
  summary?: import('./summary').AnalysisSummary,
  result?: import('./engine').AnalysisResult
) {
  if (!analysisId || !outputDir) {
    lastAnalysis = null;
  } else {
    lastAnalysis = { analysisId, outputDir, reportPath, summary, result };
  }
  for (const listener of listeners) {
    try {
      listener(lastAnalysis);
    } catch {
      // Ignore listener errors so other subscribers still receive updates.
    }
  }
}

export function getLastAnalysis() {
  return lastAnalysis;
}

export function onLastAnalysisChanged(listener: AnalysisListener) {
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
