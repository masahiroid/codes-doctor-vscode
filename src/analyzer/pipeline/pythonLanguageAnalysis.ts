import { listFiles } from '../../fileWalker';
import { GodClassResult, PythonFileInfo } from '../../types';
import { analyzeDirectory as analyzePythonDirectory } from '../python/simpleAst';
import { calculateGodScore } from '../typescript/godScore';

export interface PythonAnalysisResult {
  pythonFileInfoList: PythonFileInfo[];
  godClasses: GodClassResult[];
}

export async function analyzePython(repoPath: string, hasPython: boolean): Promise<PythonAnalysisResult> {
  if (!hasPython) return { pythonFileInfoList: [], godClasses: [] };

  console.log('\n[Step 4b] Analyzing Python files...');
  try {
    const pythonFiles = await listFiles(repoPath, ['.py']);
    console.log(`   Found ${pythonFiles.length} Python files`);

    const pythonFileInfoList = await analyzePythonDirectory(pythonFiles);
    logPythonAnalysis(pythonFileInfoList);

    const godClasses = scorePythonGodClasses(pythonFileInfoList);

    return { pythonFileInfoList, godClasses };
  } catch (error) {
    console.error('   [ERROR] Python analysis failed:', error);
    return { pythonFileInfoList: [], godClasses: [] };
  }
}

function logPythonAnalysis(pythonFileInfoList: PythonFileInfo[]): void {
  const totalClasses = pythonFileInfoList.reduce((sum, file) => sum + file.classes.length, 0);
  const totalFunctions = pythonFileInfoList.reduce((sum, file) => sum + file.functions.length, 0);
  console.log(
    `   [OK] Analyzed ${pythonFileInfoList.length} files: ${totalClasses} classes, ${totalFunctions} functions`
  );
}

function scorePythonGodClasses(pythonFileInfoList: PythonFileInfo[]): GodClassResult[] {
  if (pythonFileInfoList.length === 0) return [];
  console.log('\n[Step 4c] Calculating God Scores (Python)...');
  const godClasses: GodClassResult[] = [];
  for (const fileInfo of pythonFileInfoList) {
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
  console.log(`   [OK] Scored ${godClasses.length} Python classes`);
  return godClasses;
}
