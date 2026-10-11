import type { AnalysisResult, AnalysisLanguage } from '../types';
import { executeAnalysis } from './runner';

/**
 * Main analysis engine - orchestrates all analyzers.
 * @param repoPath - Path to repository
 * @param analysisId - Unique analysis identifier
 * @param forcedLanguage - Force analysis language (any ANALYSIS_LANGUAGES value; default: 'auto')
 */
export async function runAnalysis(
  repoPath: string,
  analysisId: string,
  forcedLanguage: AnalysisLanguage = 'auto'
): Promise<AnalysisResult> {
  return executeAnalysis(repoPath, analysisId, forcedLanguage);
}
