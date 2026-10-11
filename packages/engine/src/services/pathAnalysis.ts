import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAnalysis } from '../analyzer';
import { generateHTMLReport, ReportOptions } from '../report/htmlBuilder';
import { getReportPath } from '../report/output';
import { toAnalysisLanguage } from '../analyzer/languages/catalog';
import type { AnalysisResult } from '../types';

export interface RepositoryAnalysis {
  analysisId: string;
  repoPath: string;
  reportPath: string;
  result: AnalysisResult;
}

/**
 * Analyze a directory, write its HTML report (and LLM context files) to `outputDir`,
 * and return the full analysis result alongside the report location.
 * @param outputDir Base output directory for the report. Defaults to `<cwd>/output`.
 * @param reportOptions Presentation options, e.g. the calling tool's version.
 */
export async function analyzeRepository(
  repoPath: unknown,
  language: unknown,
  outputDir?: string,
  reportOptions: ReportOptions = {}
): Promise<RepositoryAnalysis> {
  if (!repoPath || typeof repoPath !== 'string') {
    throw new Error('repoPath is required');
  }

  const normalizedPath = path.resolve(repoPath);

  if (!fs.existsSync(normalizedPath)) {
    throw new Error('Specified path does not exist');
  }

  const stat = fs.statSync(normalizedPath);
  if (!stat.isDirectory()) {
    throw new Error('Specified path is not a directory');
  }

  const targetLanguage = toAnalysisLanguage(language);
  const analysisId = randomUUID();
  const reportPath = outputDir ? getReportPath(analysisId, outputDir) : getReportPath(analysisId);

  console.log('\n[PATH ANALYSIS] Starting analysis:');
  console.log(`   Path: ${normalizedPath}`);
  console.log(`   Analysis ID: ${analysisId}`);
  console.log(`   Language mode: ${targetLanguage}`);

  const result = await runAnalysis(normalizedPath, analysisId, targetLanguage);
  await generateHTMLReport(result, reportPath, reportOptions);

  return { analysisId, repoPath: normalizedPath, reportPath, result };
}

/** `analyzeRepository` without the analysis result, for callers that only open the report. */
export async function analyzePathRequest(
  repoPath: unknown,
  language: unknown,
  outputDir?: string,
  reportOptions: ReportOptions = {}
): Promise<{ analysisId: string; repoPath: string; reportPath: string }> {
  const { result: _result, ...report } = await analyzeRepository(repoPath, language, outputDir, reportOptions);
  return report;
}
