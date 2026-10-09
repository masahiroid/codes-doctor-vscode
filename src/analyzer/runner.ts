import type { AnalysisResult, AnalysisLanguage } from '../types';
import { getConfig } from '../config';
import { runLanguageAnalysis } from './pipeline/languageAnalysis';
import { runGlobalAnalysis } from './pipeline/globalAnalysis';

export async function executeAnalysis(
  repoPath: string,
  analysisId: string,
  forcedLanguage: AnalysisLanguage = 'auto'
): Promise<AnalysisResult> {
  console.log(`\n[Code Doctor] Starting analysis for: ${repoPath}`);
  console.log(`   Analysis ID: ${analysisId}`);
  console.log(`   Language Mode: ${forcedLanguage}\n`);

  const config = getConfig();
  const languageAnalysis = await runLanguageAnalysis(repoPath, forcedLanguage, config);
  const globalAnalysis = await runGlobalAnalysis({
    repoPath,
    config,
    detectedLanguages: languageAnalysis.detectedLanguages,
    tsFileInfoList: languageAnalysis.tsFileInfoList,
    phpFileInfoList: languageAnalysis.phpFileInfoList,
    dartFileInfoList: languageAnalysis.dartFileInfoList,
    pythonFileInfoList: languageAnalysis.pythonFileInfoList,
    allGodClasses: languageAnalysis.allGodClasses,
    callGraph: languageAnalysis.callGraph,
  });

  const analysisResult: AnalysisResult = {
    analysisId,
    repoPath,
    analyzedAt: new Date().toISOString(),
    summary: globalAnalysis.summary,
    godClasses: globalAnalysis.rankedClasses.slice(0, config.limits.maxClassesInReport),
    dependencyGraph: globalAnalysis.dependencyGraph,
    callGraph: languageAnalysis.callGraph,
    callGraphMermaid: globalAnalysis.callGraphMermaid,
    tsFiles: languageAnalysis.tsFileInfoList,
    phpFiles: languageAnalysis.phpFileInfoList,
    dartFiles: languageAnalysis.dartFileInfoList,
    pythonFiles: languageAnalysis.pythonFileInfoList,
    detectedLanguages: languageAnalysis.detectedLanguages,
    moduleMetrics: globalAnalysis.moduleMetrics,
    circularDependencies: globalAnalysis.circularDependencies,
    technicalDebt: globalAnalysis.technicalDebt,
    securityScore: globalAnalysis.securityScore,
    layerHeatmap: globalAnalysis.layerHeatmap,
    sbom: globalAnalysis.sbom,
    vulnerabilityScan: globalAnalysis.vulnerabilityScan,
    config,
  };

  console.log('\n[Code Doctor] Analysis complete!\n');
  console.log('Summary:');
  console.log(`  - Total Files: ${globalAnalysis.summary.totalFiles}`);
  console.log(`  - Total Classes: ${globalAnalysis.summary.totalClasses}`);
  console.log(`  - Critical Classes: ${globalAnalysis.rankedClasses.filter((result) => result.rank === 'critical').length}`);
  console.log(`  - Avg God Score: ${globalAnalysis.summary.avgGodScore}`);
  console.log('');

  return analysisResult;
}