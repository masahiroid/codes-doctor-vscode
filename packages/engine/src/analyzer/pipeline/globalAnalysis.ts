import { allLanguageFiles } from '../languages/catalog';
import type { GlobalAnalysisInput, GlobalAnalysisOutput } from './contracts';
import { runGraphAnalysis } from './graphAnalysis';
import { runQualityAnalysis } from './qualityAnalysis';
import { runSupplyChainAnalysis } from './supplyChainAnalysis';

export async function runGlobalAnalysis(input: GlobalAnalysisInput): Promise<GlobalAnalysisOutput> {
  const { repoPath, config, detectedLanguages, files, allGodClasses, callGraph } = input;

  const graphAnalysis = runGraphAnalysis(allLanguageFiles(files), config, callGraph);
  const qualityAnalysis = await runQualityAnalysis({
    repoPath,
    detectedLanguages,
    files,
    allGodClasses,
    moduleMetrics: graphAnalysis.moduleMetrics,
    circularDependencies: graphAnalysis.circularDependencies,
  });
  const supplyChainAnalysis = await runSupplyChainAnalysis(repoPath);

  return {
    rankedClasses: qualityAnalysis.rankedClasses,
    dependencyGraph: graphAnalysis.dependencyGraph,
    callGraphMermaid: graphAnalysis.callGraphMermaid,
    summary: qualityAnalysis.summary,
    moduleMetrics: graphAnalysis.moduleMetrics,
    circularDependencies: graphAnalysis.circularDependencies,
    technicalDebt: qualityAnalysis.technicalDebt,
    securityScore: qualityAnalysis.securityScore,
    layerHeatmap: qualityAnalysis.layerHeatmap,
    sbom: supplyChainAnalysis.sbom,
    vulnerabilityScan: supplyChainAnalysis.vulnerabilityScan,
  };
}
