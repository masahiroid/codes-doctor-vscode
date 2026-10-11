import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAnalysis } from '../analyzer';
import { generateHTMLReport } from '../report/htmlBuilder';
import { getReportPath } from '../report/output';
import { toAnalysisLanguage } from '../analyzer/languages/catalog';

/**
 * @param outputDir Base output directory for the generated report. Defaults to
 * `<cwd>/output` for the server; callers embedding CSAP elsewhere (e.g. the
 * VS Code extension) can point this at their own storage location.
 */
export async function analyzePathRequest(
  repoPath: unknown,
  language: unknown,
  outputDir?: string
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
  await generateHTMLReport(result, reportPath);

  return {
    analysisId,
    repoPath: normalizedPath,
    reportPath,
  };
}