import type { GlobalAnalysisInput, GlobalAnalysisOutput } from './contracts';
import { runGraphAnalysis } from './graphAnalysis';
import { runQualityAnalysis } from './qualityAnalysis';
import { runSupplyChainAnalysis } from './supplyChainAnalysis';

export async function runGlobalAnalysis(input: GlobalAnalysisInput): Promise<GlobalAnalysisOutput> {
  const {
    repoPath,
    config,
    detectedLanguages,
    tsFileInfoList,
    phpFileInfoList,
    dartFileInfoList,
    pythonFileInfoList,
    allGodClasses,
    callGraph,
  } = input;

  const allFiles = [...tsFileInfoList, ...phpFileInfoList, ...dartFileInfoList, ...pythonFileInfoList];
  const graphAnalysis = runGraphAnalysis(allFiles, config, callGraph);
  const qualityAnalysis = await runQualityAnalysis({
    repoPath,
    detectedLanguages,
    tsFileInfoList,
    phpFileInfoList,
    dartFileInfoList,
    pythonFileInfoList,
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
