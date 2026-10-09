import type { AppConfig } from '../../config';
import type { AnalysisResult, CallGraph } from '../../types';

export interface GlobalAnalysisInput {
  repoPath: string;
  config: AppConfig;
  detectedLanguages: AnalysisResult['detectedLanguages'];
  tsFileInfoList: any[];
  phpFileInfoList: any[];
  dartFileInfoList: any[];
  pythonFileInfoList: any[];
  allGodClasses: any[];
  callGraph: CallGraph;
}

export interface GlobalAnalysisOutput {
  rankedClasses: any[];
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