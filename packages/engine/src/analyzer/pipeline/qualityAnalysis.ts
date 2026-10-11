import { rankClasses } from '../typescript/godScore';
import { calculateTechnicalDebt } from '../technicalDebt';
import { calculateSecurityScore } from '../securityScore';
import { generateLayerHeatmap } from '../layerAnalysis';
import type { AnalysisResult, GodClassResult, LanguageFileMap } from '../../types';
import { LANGUAGES, allLanguageFiles } from '../languages/catalog';
import type { SecurityScanTarget } from '../securityScore';
import type { LayerSource } from '../layerAnalysis';

export interface QualityAnalysisResult {
  rankedClasses: GodClassResult[];
  summary: AnalysisResult['summary'];
  technicalDebt: NonNullable<AnalysisResult['technicalDebt']>;
  securityScore: NonNullable<AnalysisResult['securityScore']>;
  layerHeatmap: NonNullable<AnalysisResult['layerHeatmap']>;
}

export async function runQualityAnalysis(input: {
  repoPath: string;
  detectedLanguages: AnalysisResult['detectedLanguages'];
  files: LanguageFileMap;
  allGodClasses: GodClassResult[];
  moduleMetrics: AnalysisResult['moduleMetrics'];
  circularDependencies: AnalysisResult['circularDependencies'];
}): Promise<QualityAnalysisResult> {
  const { repoPath, detectedLanguages, files, allGodClasses, moduleMetrics, circularDependencies } = input;

  console.log('\n[Step 5] Ranking God Classes...');
  const rankedClasses = rankClasses(allGodClasses);
  console.log(`   [OK] Ranked ${rankedClasses.length} classes`);

  const summary = buildSummary(detectedLanguages, rankedClasses, files);

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
  const securityScore = await calculateSecurityScore(securityTargets(files), repoPath);
  console.log(`   [OK] Security Score: ${securityScore.overallScore}/100 (Grade: ${securityScore.grade})`);
  console.log(
    `   Issues: Critical=${securityScore.summary.critical}, High=${securityScore.summary.high}, Medium=${securityScore.summary.medium}`
  );

  console.log('\n[Step 13] Generating Layer Heatmap...');
  const layerHeatmap = generateLayerHeatmap(layerSources(files), rankedClasses, repoPath);
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

/** Languages that have a security pattern family, with their parsed files. */
function securityTargets(files: LanguageFileMap): SecurityScanTarget[] {
  return LANGUAGES.flatMap((language) =>
    'security' in language ? [{ language: language.security, files: files[language.id] }] : []
  );
}

/** Languages that participate in the layer heatmap, with their parsed files. */
function layerSources(files: LanguageFileMap): LayerSource[] {
  return LANGUAGES.flatMap((language) =>
    'layerDependencies' in language ? [{ dependencyStyle: language.layerDependencies, files: files[language.id] }] : []
  );
}

function buildSummary(
  detectedLanguages: AnalysisResult['detectedLanguages'],
  rankedClasses: GodClassResult[],
  files: LanguageFileMap
): AnalysisResult['summary'] {
  console.log('\n[Step 8] Computing summary statistics...');

  const parsedFiles = allLanguageFiles(files);
  const totalFiles = detectedLanguages.totalFiles;
  const totalClasses = countClasses(parsedFiles);
  const totalMethods = countMethods(parsedFiles);
  const avgGodScore =
    rankedClasses.length > 0
      ? Math.round(rankedClasses.reduce((sum, result) => sum + result.godScore, 0) / rankedClasses.length)
      : 0;

  return { totalFiles, totalClasses, totalMethods, avgGodScore };
}

function countClasses(fileInfoList: ReadonlyArray<{ classes: unknown[] }>): number {
  return fileInfoList.reduce((sum, file) => sum + file.classes.length, 0);
}

function countMethods(fileInfoList: ReadonlyArray<{ classes: Array<{ methodCount: number }> }>): number {
  return fileInfoList.reduce(
    (sum, file) => sum + file.classes.reduce((classSum, classInfo) => classSum + classInfo.methodCount, 0),
    0
  );
}