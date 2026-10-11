import { buildDependencyGraph } from '../../graph/mermaid';
import { calculateModuleMetrics, detectCircularDependencies } from '../moduleMetrics';
import { toMermaidCallGraph } from '../typescript/callGraph';
import type { AppConfig } from '../../config';
import type { AnalysisResult, CallGraph } from '../../types';

export interface GraphAnalysisResult {
  dependencyGraph: string;
  callGraphMermaid: string;
  moduleMetrics: AnalysisResult['moduleMetrics'];
  circularDependencies: AnalysisResult['circularDependencies'];
}

export function runGraphAnalysis(
  allFiles: any[],
  config: AppConfig,
  callGraph: CallGraph
): GraphAnalysisResult {
  return {
    dependencyGraph: buildDependencyGraphSafely(allFiles, config),
    callGraphMermaid: buildCallGraphMermaid(callGraph),
    moduleMetrics: calculateModuleMetricsWithLogging(allFiles),
    circularDependencies: detectCircularDependenciesWithLogging(allFiles),
  };
}

function buildDependencyGraphSafely(allFiles: any[], config: AppConfig): string {
  console.log('\n[Step 6] Building dependency graph...');
  let dependencyGraph = 'graph LR\n  note["No dependencies"]';

  try {
    if (!config.features.mermaidDependency || allFiles.length === 0) {
      return dependencyGraph;
    }

    const totalDeps = allFiles.reduce(
      (sum, file) => sum + (file.dependencies?.length ?? file.imports?.length ?? 0),
      0
    );
    console.log(`   Found ${totalDeps} total import statements across ${allFiles.length} files`);

    dependencyGraph = buildDependencyGraph(allFiles);
    const hasEdges = !dependencyGraph.includes('No internal dependencies');
    console.log(`   [OK] Built dependency graph${hasEdges ? '' : ' (no internal dependencies detected)'}`);
  } catch (error) {
    console.error('   [ERROR] Dependency graph failed:', error);
  }

  return dependencyGraph;
}

function buildCallGraphMermaid(callGraph: CallGraph): string {
  console.log('\n[Step 7] Converting call graph to Mermaid...');
  const callGraphMermaid = toMermaidCallGraph(callGraph);
  console.log('   [OK] Generated Mermaid call graph');
  return callGraphMermaid;
}

function calculateModuleMetricsWithLogging(allFiles: any[]): AnalysisResult['moduleMetrics'] {
  console.log('\n[Step 9] Calculating module metrics (fan-in/fan-out)...');
  const moduleMetrics = calculateModuleMetrics(allFiles);
  console.log(`   [OK] Calculated metrics for ${moduleMetrics.length} modules`);
  return moduleMetrics;
}

function detectCircularDependenciesWithLogging(allFiles: any[]): AnalysisResult['circularDependencies'] {
  console.log('\n[Step 10] Detecting circular dependencies...');
  const circularDependencies = detectCircularDependencies(allFiles);
  console.log(`   [OK] Found ${circularDependencies.length} circular dependencies`);

  if (circularDependencies.length > 0) {
    console.log('   [WARNING] Circular dependencies detected!');
    circularDependencies.slice(0, 3).forEach((cycle, index) => {
      console.log(`   [CYCLE ${index + 1}] ${cycle.cycle.join(' -> ')}`);
    });
  }

  return circularDependencies;
}