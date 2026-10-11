import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAnalysis } from '../analyzer';
import { generateHTMLReport, ReportOptions } from '../report/htmlBuilder';
import { getReportPath } from '../report/output';
import { toAnalysisLanguage } from '../analyzer/languages/catalog';

/**
 * Analyze a directory and write its HTML report.
 * @param outputDir Base output directory for the report. Defaults to `<cwd>/output`.
 * @param reportOptions Presentation options, e.g. the calling tool's version.
 */
export async function analyzePathRequest(
  repoPath: unknown,
  language: unknown,
  outputDir?: string,
  reportOptions: ReportOptions = {}
): Promise<{
  analysisId: string;
  repoPath: string;
  reportPath: string;
}> {
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

  return {
    analysisId,
    repoPath: normalizedPath,
    reportPath,
  };
}