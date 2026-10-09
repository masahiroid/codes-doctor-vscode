import { AppConfig } from '../../config';
import { DetectionResult, AnalysisLanguage, GodClassResult, CallGraph, PythonFileInfo } from '../../types';
import { detectLanguages } from '../languageDetector';
import { analyzeTypeScriptAndJavaScript } from './tsLanguageAnalysis';
import { analyzePhp } from './phpLanguageAnalysis';
import { analyzeDart } from './dartLanguageAnalysis';
import { analyzePython } from './pythonLanguageAnalysis';

export interface LanguageAnalysisResult {
  detectedLanguages: DetectionResult;
  tsFileInfoList: any[];
  phpFileInfoList: any[];
  dartFileInfoList: any[];
  pythonFileInfoList: PythonFileInfo[];
  allGodClasses: GodClassResult[];
  callGraph: CallGraph;
}

export async function runLanguageAnalysis(
  repoPath: string,
  forcedLanguage: AnalysisLanguage,
  config: AppConfig
): Promise<LanguageAnalysisResult> {
  const detectedLanguages = await detectAndPrepareLanguages(repoPath, forcedLanguage);

  const tsResult = await analyzeTypeScriptAndJavaScript(
    repoPath,
    detectedLanguages.hasTypeScript,
    detectedLanguages.hasJavaScript,
    config
  );
  const phpResult = await analyzePhp(
    repoPath,
    detectedLanguages.hasPHP,
    config,
    tsResult.callGraph
  );
  const dartFileInfoList = await analyzeDart(repoPath, detectedLanguages.hasDart);
  const pythonResult = await analyzePython(repoPath, detectedLanguages.hasPython);

  return {
    detectedLanguages,
    tsFileInfoList: tsResult.tsFileInfoList,
    phpFileInfoList: phpResult.phpFileInfoList,
    dartFileInfoList,
    pythonFileInfoList: pythonResult.pythonFileInfoList,
    allGodClasses: [...tsResult.godClasses, ...phpResult.godClasses, ...pythonResult.godClasses],
    callGraph: phpResult.callGraph,
  };
}

async function detectAndPrepareLanguages(
  repoPath: string,
  forcedLanguage: AnalysisLanguage
): Promise<DetectionResult> {
  console.log('[Step 1] Detecting languages...');

  let detectedLanguages: DetectionResult;
  try {
    detectedLanguages = await detectLanguages(repoPath);
    console.log(
      `   Found: TS=${detectedLanguages.fileCount.ts}, JS=${detectedLanguages.fileCount.js}, PHP=${detectedLanguages.fileCount.php}, Dart=${detectedLanguages.fileCount.dart}, Python=${detectedLanguages.fileCount.python}`
    );
  } catch (error) {
    console.error('   [ERROR] Language detection failed:', error);
    throw error;
  }

  if (forcedLanguage !== 'auto') {
    applyForcedLanguageOverride(detectedLanguages, forcedLanguage);
  }

  return detectedLanguages;
}

/** Which detection flags a forced language mode should enable; all others are disabled. */
const FORCED_LANGUAGE_FLAGS: Record<Exclude<AnalysisLanguage, 'auto'>, Array<keyof DetectionResult>> = {
  typescript: ['hasTypeScript'],
  javascript: ['hasJavaScript'],
  php: ['hasPHP'],
  dart: ['hasDart'],
  python: ['hasPython'],
};

const ALL_LANGUAGE_FLAGS: Array<keyof DetectionResult> = [
  'hasTypeScript',
  'hasJavaScript',
  'hasPHP',
  'hasDart',
  'hasPython',
];

function applyForcedLanguageOverride(
  detectedLanguages: DetectionResult,
  forcedLanguage: AnalysisLanguage
): void {
  if (forcedLanguage === 'auto') return;

  console.log(`[Language Override] Forcing analysis to: ${forcedLanguage}`);

  const flagsToEnable = FORCED_LANGUAGE_FLAGS[forcedLanguage];
  for (const flag of ALL_LANGUAGE_FLAGS) {
    (detectedLanguages[flag] as boolean) = flagsToEnable.includes(flag);
  }
}
