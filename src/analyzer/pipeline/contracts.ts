import type { AppConfig } from '../../config';
import type { AnalysisResult, CallGraph, GodClassResult, LanguageFileMap } from '../../types';

export interface GlobalAnalysisInput {
  repoPath: string;
  config: AppConfig;
  detectedLanguages: AnalysisResult['detectedLanguages'];
  files: LanguageFileMap;
  allGodClasses: GodClassResult[];
  callGraph: CallGraph;
}

export interface GlobalAnalysisOutput {
  rankedClasses: GodClassResult[];
  dependencyGraph: string;
  callGraphMermaid: string;
  summary: AnalysisResult['summary'];
  moduleMetrics: AnalysisResult['moduleMetrics'];
  circularDependencies: AnalysisResult['circularDependencies'];
  technicalDebt: NonNullable<AnalysisResult['technicalDebt']>;
  securityScore: NonNullable<AnalysisResult['securityScore']>;
  layerHeatmap: NonNullable<AnalysisResult['layerHeatmap']>;
  sbom: NonNullable<AnalysisResult['sbom']>;
  vulnerabilityScan: NonNullable<AnalysisResult['vulnerabilityScan']>;
}
