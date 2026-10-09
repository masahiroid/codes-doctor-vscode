import { rankClasses } from '../typescript/godScore';
import { calculateTechnicalDebt } from '../technicalDebt';
import { calculateSecurityScore } from '../securityScore';
import { generateLayerHeatmap } from '../layerAnalysis';
import type { AnalysisResult } from '../../types';

export interface QualityAnalysisResult {
  rankedClasses: any[];
  summary: AnalysisResult['summary'];
  technicalDebt: NonNullable<AnalysisResult['technicalDebt']>;
  securityScore: NonNullable<AnalysisResult['securityScore']>;
  layerHeatmap: NonNullable<AnalysisResult['layerHeatmap']>;
}

export async function runQualityAnalysis(input: {
  repoPath: string;
  detectedLanguages: AnalysisResult['detectedLanguages'];
  tsFileInfoList: any[];
  phpFileInfoList: any[];
  dartFileInfoList: any[];
  pythonFileInfoList: any[];
  allGodClasses: any[];
  moduleMetrics: AnalysisResult['moduleMetrics'];
  circularDependencies: AnalysisResult['circularDependencies'];
}): Promise<QualityAnalysisResult> {
  const {
    repoPath,
    detectedLanguages,
    tsFileInfoList,
    phpFileInfoList,
    dartFileInfoList,
    pythonFileInfoList,
    allGodClasses,
    moduleMetrics,
    circularDependencies,
  } = input;

  console.log('\n[Step 5] Ranking God Classes...');
  const rankedClasses = rankClasses(allGodClasses);
  console.log(`   [OK] Ranked ${rankedClasses.length} classes`);

  const summary = buildSummary(
    detectedLanguages,
    rankedClasses,
    tsFileInfoList,
    phpFileInfoList,
    dartFileInfoList,
    pythonFileInfoList
  );

  console.log('\n[Step 11] Calculating Technical Debt Score...');
  const technicalDebt = calculateTechnicalDebt(
    rankedClasses,
    moduleMetrics,
    circularDependencies,
    summary.totalFiles
  );
  console.log(`   [OK] Technical Debt Score: ${technicalDebt.overallScore}/100 (Grade: ${technicalDebt.grade})`);
  console.log(
    `   Issues: Critical=${technicalDebt.issues.critical}, High=${technicalDebt.issues.high}, Medium=${technicalDebt.issues.medium}`
  );

  console.log('\n[Step 12] Calculating Security Score...');
  const securityScore = await calculateSecurityScore(tsFileInfoList, phpFileInfoList, repoPath, pythonFileInfoList);
  console.log(`   [OK] Security Score: ${securityScore.overallScore}/100 (Grade: ${securityScore.grade})`);
  console.log(
    `   Issues: Critical=${securityScore.summary.critical}, High=${securityScore.summary.high}, Medium=${securityScore.summary.medium}`
  );

  console.log('\n[Step 13] Generating Layer Heatmap...');
  const layerHeatmap = generateLayerHeatmap(tsFileInfoList, phpFileInfoList, rankedClasses, pythonFileInfoList);
  console.log(`   [OK] Identified ${layerHeatmap.layers.length} architectural layers`);
  layerHeatmap.layers.forEach((layer) => {
    console.log(`   - ${layer.name}: ${layer.fileCount} files, ${layer.classCount} classes`);
  });

  return {
    rankedClasses,
    summary,
    technicalDebt,
    securityScore,
    layerHeatmap,
  };
}

function buildSummary(
  detectedLanguages: AnalysisResult['detectedLanguages'],
  rankedClasses: any[],
  tsFileInfoList: any[],
  phpFileInfoList: any[],
  dartFileInfoList: any[],
  pythonFileInfoList: any[]
): AnalysisResult['summary'] {
  console.log('\n[Step 8] Computing summary statistics...');

  const allFileInfoLists = [tsFileInfoList, phpFileInfoList, dartFileInfoList, pythonFileInfoList];
  const totalFiles = detectedLanguages.fileCount.total;
  const totalClasses = allFileInfoLists.reduce((sum, list) => sum + countClasses(list), 0);
  const totalMethods = allFileInfoLists.reduce((sum, list) => sum + countMethods(list), 0);
  const avgGodScore =
    rankedClasses.length > 0
      ? Math.round(rankedClasses.reduce((sum, result) => sum + result.godScore, 0) / rankedClasses.length)
      : 0;

  return {
    totalFiles,
    tsFiles: detectedLanguages.fileCount.ts,
    phpFiles: detectedLanguages.fileCount.php,
    dartFiles: detectedLanguages.fileCount.dart,
    pythonFiles: detectedLanguages.fileCount.python,
    totalClasses,
    totalMethods,
    avgGodScore,
  };
}

function countClasses(fileInfoList: any[]): number {
  return fileInfoList.reduce((sum, file) => sum + file.classes.length, 0);
}

function countMethods(fileInfoList: any[]): number {
  return fileInfoList.reduce(
    (sum, file) => sum + file.classes.reduce((classSum: number, classInfo: any) => classSum + classInfo.methodCount, 0),
    0
  );
}