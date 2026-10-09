/**
 * Tracks the most recent analysis result in memory (not persisted) so the
 * Dashboard can run an LLM review against it without re-running the analysis.
 * A single global slot is enough for this extension's single-dashboard UI.
 */
let lastAnalysis: import('./types').AnalysisReference | null = null;

export function setLastAnalysis(analysisId: string, outputDir: string, reportPath?: string) {
  lastAnalysis = { analysisId, outputDir, reportPath };
}

export function getLastAnalysis() {
  return lastAnalysis;
}

module.exports = {
  setLastAnalysis,
  getLastAnalysis,
};
