const ANALYSIS_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * analysisId is generated as a random UUID (see services/pathAnalysis.ts) and used to build filesystem paths
 * throughout the app. Reject anything that doesn't match that shape before it reaches
 * path.join, to prevent path traversal via a crafted analysisId.
 */
export function isValidAnalysisId(analysisId: string): boolean {
  return ANALYSIS_ID_PATTERN.test(analysisId);
}

const FOCUS_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * focus is used to build a filesystem path segment (see getLlmResultPath), so restrict
 * it to a safe character set.
 */
export function isValidFocus(focus: string): boolean {
  return FOCUS_PATTERN.test(focus);
}
