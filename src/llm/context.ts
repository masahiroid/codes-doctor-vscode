import fs from 'node:fs';
import path from 'node:path';
import { allLanguageFiles } from '../analyzer/languages/catalog';
import { AnalysisResult } from '../types';
import { buildModuleMetricsContext, ModuleMetricsContext } from './context/moduleMetricsContext';
import { buildCallGraphContext, CallGraphContext } from './context/callGraphContext';
import { buildDependencyGraphContext, DependencyGraphContext } from './context/dependencyGraphContext';
import { buildCircularDependencyContext, CircularDependencyContext } from './context/circularDependencyContext';
import { buildGodClassContext, GodClassContext } from './context/godClassContext';
import { buildLayerHeatmapContext, LayerHeatmapContext } from './context/layerHeatmapContext';
import { buildAstOnlyLlmContext, AstOnlyLlmContext } from './context/astOnlyContext';

export type { AstOnlyLlmContext };

export interface LlmContext {
  analysisId: string;
  repoName: string;
  analyzedAt: string;
  primaryLanguage: string;
  moduleMetrics: ModuleMetricsContext;
  callGraph: CallGraphContext;
  dependencyGraph: DependencyGraphContext;
  circularDependencies: CircularDependencyContext;
  layerHeatmap?: LayerHeatmapContext;
  godClasses: GodClassContext;
}

/**
 * Build the full LLM context: orchestrates the per-domain summarizers below.
 * Each domain (module metrics, call graph, dependency graph, ...) is summarized
 * independently so this function stays a plain assembly step.
 */
export function buildLlmContext(result: AnalysisResult): LlmContext {
  return {
    analysisId: result.analysisId,
    repoName: path.basename(result.repoPath),
    analyzedAt: result.analyzedAt,
    primaryLanguage: result.detectedLanguages.primaryLanguage,
    moduleMetrics: buildModuleMetricsContext(result.moduleMetrics),
    callGraph: buildCallGraphContext(result.callGraph),
    dependencyGraph: buildDependencyGraphContext(allLanguageFiles(result.files)),
    circularDependencies: buildCircularDependencyContext(result.circularDependencies || []),
    layerHeatmap: buildLayerHeatmapContext(result.layerHeatmap),
    godClasses: buildGodClassContext(result.godClasses || []),
  };
}

export { buildAstOnlyLlmContext };

const defaultOutputDir = (): string => path.join(process.cwd(), 'output');

export function getLlmContextPath(analysisId: string, outputDir: string = defaultOutputDir()): string {
  return path.join(outputDir, `${analysisId}.llm-context.json`);
}

export function getAstOnlyLlmContextPath(analysisId: string, outputDir: string = defaultOutputDir()): string {
  return path.join(outputDir, `${analysisId}.llm-ast-only.json`);
}

export function getLlmResultPath(analysisId: string, focus: string, outputDir: string = defaultOutputDir()): string {
  const safeFocus = focus.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(outputDir, `${analysisId}.llm-${safeFocus}.json`);
}

export function writeLlmContext(result: AnalysisResult, outputDir: string = defaultOutputDir()): void {
  const contextPath = getLlmContextPath(result.analysisId, outputDir);
  const context = buildLlmContext(result);
  fs.writeFileSync(contextPath, JSON.stringify(context, null, 2), 'utf-8');

  const astContextPath = getAstOnlyLlmContextPath(result.analysisId, outputDir);
  const astContext = buildAstOnlyLlmContext(result);
  fs.writeFileSync(astContextPath, JSON.stringify(astContext, null, 2), 'utf-8');
}
