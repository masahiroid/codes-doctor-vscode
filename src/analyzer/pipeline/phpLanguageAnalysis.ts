import { AppConfig } from '../../config';
import { CallGraph, GodClassResult } from '../../types';
import { listFiles } from '../../fileWalker';
import { calculateGodScore } from '../typescript/godScore';
import { analyzeDirectory as analyzePHPDirectory } from '../php/astRunner';
import { buildPHPCallGraph } from '../php/callGraph';

export interface PhpAnalysisResult {
  phpFileInfoList: any[];
  godClasses: GodClassResult[];
  callGraph: CallGraph;
}

export async function analyzePhp(
  repoPath: string,
  hasPHP: boolean,
  config: AppConfig,
  baseCallGraph: CallGraph
): Promise<PhpAnalysisResult> {
  if (!hasPHP || !config.features.phpAnalysis) {
    return { phpFileInfoList: [], godClasses: [], callGraph: baseCallGraph };
  }

  console.log('\n[Step 3] Analyzing PHP files...');
  try {
    const phpFiles = await listFiles(repoPath, ['.php']);
    console.log(`   Found ${phpFiles.length} PHP files`);

    const phpFileInfoList = await analyzePHPDirectory(phpFiles);
    console.log(`   [OK] Analyzed ${phpFileInfoList.length} files`);

    const godClasses = scorePhpGodClasses(phpFileInfoList);
    const callGraph = await buildPhpCallGraph(phpFileInfoList, config, baseCallGraph);

    return { phpFileInfoList, godClasses, callGraph };
  } catch (error) {
    console.error('   [ERROR] PHP analysis failed:', error);
    return { phpFileInfoList: [], godClasses: [], callGraph: baseCallGraph };
  }
}

function scorePhpGodClasses(phpFileInfoList: any[]): GodClassResult[] {
  if (phpFileInfoList.length === 0) return [];
  console.log('\n[Step 3b] Calculating God Scores (PHP)...');
  const godClasses: GodClassResult[] = [];
  for (const fileInfo of phpFileInfoList) {
    for (const classInfo of fileInfo.classes) {
      godClasses.push(
        calculateGodScore({
          name: classInfo.name,
          filePath: classInfo.filePath,
          lineCount: classInfo.lineCount,
          methodCount: classInfo.methodCount,
          propertyCount: classInfo.propertyCount,
          importCount: classInfo.useCount,
        })
      );
    }
  }
  console.log(`   [OK] Scored ${godClasses.length} PHP classes`);
  return godClasses;
}

async function buildPhpCallGraph(
  phpFileInfoList: any[],
  config: AppConfig,
  baseCallGraph: CallGraph
): Promise<CallGraph> {
  if (!config.features.callGraph || phpFileInfoList.length === 0) {
    return baseCallGraph;
  }
  console.log('\n🔗 Step 3c: Building PHP call graph...');
  const phpCallGraph = await buildPHPCallGraph(phpFileInfoList);
  console.log(`   [OK] Found ${phpCallGraph.edges.length} PHP call edges`);
  return {
    edges: [...baseCallGraph.edges, ...phpCallGraph.edges],
    nodes: [...baseCallGraph.nodes, ...phpCallGraph.nodes],
  };
}
