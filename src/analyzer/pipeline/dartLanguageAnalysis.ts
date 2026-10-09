import { listFiles } from '../../fileWalker';
import { analyzeDirectory as analyzeDartDirectory } from '../dart/simpleAst';

export async function analyzeDart(
  repoPath: string,
  hasDart: boolean
): Promise<any[]> {
  if (!hasDart) return [];

  console.log('\n[Step 4] Analyzing Dart files...');
  try {
    const dartFiles = await listFiles(repoPath, ['.dart']);
    console.log(`   Found ${dartFiles.length} Dart files`);

    const dartFileInfoList = await analyzeDartDirectory(dartFiles);
    const totalClasses = dartFileInfoList.reduce((sum: number, file: any) => sum + file.classes.length, 0);
    const totalFunctions = dartFileInfoList.reduce((sum: number, file: any) => sum + file.functions.length, 0);
    console.log(
      `   [OK] Analyzed ${dartFileInfoList.length} files: ${totalClasses} classes, ${totalFunctions} functions`
    );
    return dartFileInfoList;
  } catch (error) {
    console.error('   [ERROR] Dart analysis failed:', error);
    return [];
  }
}
