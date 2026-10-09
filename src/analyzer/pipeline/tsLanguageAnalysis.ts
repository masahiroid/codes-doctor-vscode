import { AppConfig } from '../../config';
import { CallGraph, GodClassResult } from '../../types';
import { listFiles } from '../../fileWalker';
import { analyzeDirectory as analyzeTypeScriptDirectory } from '../typescript/ast';
import { calculateGodScore } from '../typescript/godScore';
import { buildCallGraph } from '../typescript/callGraph';

export interface TsAnalysisResult {
  tsFileInfoList: any[];
  godClasses: GodClassResult[];
  callGraph: CallGraph;
}

export async function analyzeTypeScriptAndJavaScript(
  repoPath: string,
  hasTypeScript: boolean,
  hasJavaScript: boolean,
  config: AppConfig
): Promise<TsAnalysisResult> {
  const emptyCallGraph: CallGraph = { edges: [], nodes: [] };
  if (!hasTypeScript && !hasJavaScript) {
    return { tsFileInfoList: [], godClasses: [], callGraph: emptyCallGraph };
  }

  console.log('\n[Step 2] Analyzing TypeScript/JavaScript files...');
  try {
    const tsFiles = await listFiles(repoPath, ['.ts', '.tsx']);
    const jsFiles = await listFiles(repoPath, ['.js', '.jsx']);
    const allTsJsFiles = [...tsFiles, ...jsFiles];
    console.log(`   Found ${allTsJsFiles.length} TS/JS files`);

    let tsFileInfoList: any[] = [];
    if (allTsJsFiles.length > 0) {
      console.log('   Parsing files...');
      tsFileInfoList = await analyzeTypeScriptDirectory(repoPath, allTsJsFiles);
      logTypeScriptAnalysis(tsFileInfoList);
    }

    const godClasses = scoreTypeScriptGodClasses(tsFileInfoList);
    const callGraph = await buildTypeScriptCallGraph(tsFileInfoList, config);

    return { tsFileInfoList, godClasses, callGraph };
  } catch (error) {
    console.error('   [ERROR] TS/JS analysis failed:', error);
    return { tsFileInfoList: [], godClasses: [], callGraph: emptyCallGraph };
  }
}

function logTypeScriptAnalysis(tsFileInfoList: any[]): void {
  const totalClasses = tsFileInfoList.reduce((sum, file) => sum + file.classes.length, 0);
  const totalFunctions = tsFileInfoList.reduce((sum, file) => sum + file.functions.length, 0);
  console.log(
    `   [OK] Analyzed ${tsFileInfoList.length} files: ${totalClasses} classes, ${totalFunctions} functions`
  );
  if (totalClasses === 0) {
    console.warn('   [WARNING] No classes detected!');
    tsFileInfoList.slice(0, 3).forEach((file) => {
      console.log(
        `   [DEBUG] File: ${file.filePath}, Classes: ${file.classes.length}, Functions: ${file.functions.length}`
      );
    });
  }
}

function scoreTypeScriptGodClasses(tsFileInfoList: any[]): GodClassResult[] {
  if (tsFileInfoList.length === 0) return [];
  console.log('\n[Step 2b] Calculating God Scores (TS/JS)...');
  const godClasses: GodClassResult[] = [];
  for (const fileInfo of tsFileInfoList) {
    for (const classInfo of fileInfo.classes) {
      godClasses.push(
        calculateGodScore({
          name: classInfo.name,
          filePath: classInfo.filePath,
          lineCount: classInfo.lineCount,
          methodCount: classInfo.methodCount,
          propertyCount: classInfo.propertyCount,
          importCount: classInfo.importCount,
        })
      );
    }
  }
  console.log(`   [OK] Scored ${godClasses.length} classes`);
  return godClasses;
}

async function buildTypeScriptCallGraph(
  tsFileInfoList: any[],
  config: AppConfig
): Promise<CallGraph> {
  if (!config.features.callGraph || tsFileInfoList.length === 0) {
    return { edges: [], nodes: [] };
  }
  console.log('\n🔗 Step 2c: Building call graph...');
  const callGraph = await buildCallGraph(tsFileInfoList);
  console.log(`   [OK] Found ${callGraph.edges.length} call edges`);
  return callGraph;
}
