import { AppConfig } from '../../config';
import type { CallGraph, DetectionResult, GodClassResult, LanguageFileMap } from '../../types';
import { detectLanguages } from '../languageDetector';
import { AnalysisLanguage, LANGUAGES, LanguageId, emptyLanguageFiles } from '../languages/catalog';
import { LANGUAGE_ANALYZERS, LanguageAnalysisContext } from '../languages/analyzers';

export interface LanguageAnalysisResult {
  detectedLanguages: DetectionResult;
  files: LanguageFileMap;
  allGodClasses: GodClassResult[];
  callGraph: CallGraph;
}

async function analyzeLanguage<K extends LanguageId>(id: K, context: LanguageAnalysisContext, files: LanguageFileMap) {
  const output = await LANGUAGE_ANALYZERS[id](context);
  files[id] = output.files;
  return output;
}

/** Detect languages, then run each language's analyzer in catalog order. */
export async function runLanguageAnalysis(repoPath: string, mode: AnalysisLanguage, config: AppConfig): Promise<LanguageAnalysisResult> {
  console.log('[Step 1] Detecting languages...');
  const { detection, sourceFiles } = await detectLanguages(repoPath, mode);
  const counts = Object.entries(detection.fileCounts).map(([id, count]) => `${id}=${count}`).join(', ');
  console.log(`   Found: ${counts} (mode: ${mode})`);

  const files = emptyLanguageFiles();
  const allGodClasses: GodClassResult[] = [];
  let callGraph: CallGraph = { edges: [], nodes: [] };
  for (const { id } of LANGUAGES) {
    const output = await analyzeLanguage(id, { repoPath, config, sourceFiles, callGraph }, files);
    allGodClasses.push(...output.godClasses);
    callGraph = output.callGraph ?? callGraph;
  }

  return { detectedLanguages: detection, files, allGodClasses, callGraph };
}
