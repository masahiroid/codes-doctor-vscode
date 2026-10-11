import { listFilesByExtension } from '../fileWalker';
import type { DetectionResult } from '../types';
import { AnalysisLanguage, SOURCE_LANGUAGES, SourceLanguageId, enabledSourcesFor } from './languages/catalog';

type PrimaryLanguage = DetectionResult['primaryLanguage'];

/** Share of total files a language must reach to be called the sole primary language */
const MIXED_LANGUAGE_THRESHOLD = 0.7;

export interface LanguageDetection {
  detection: DetectionResult;
  /** Files per source language, emptied for languages the analysis mode does not enable. */
  sourceFiles: Record<SourceLanguageId, string[]>;
}

/**
 * Detect the languages in a repository with a single directory walk, and apply the
 * analysis mode (`auto` analyzes everything detected; a forced mode narrows it).
 */
export async function detectLanguages(repoPath: string, mode: AnalysisLanguage): Promise<LanguageDetection> {
  const filesBySource = await listFilesByExtension(repoPath, SOURCE_LANGUAGES);
  const enabledSources = enabledSourcesFor(mode);

  const fileCounts = {} as Record<SourceLanguageId, number>;
  const enabled = {} as Record<SourceLanguageId, boolean>;
  const sourceFiles = {} as Record<SourceLanguageId, string[]>;
  for (const { id } of SOURCE_LANGUAGES) {
    fileCounts[id] = filesBySource[id].length;
    enabled[id] = enabledSources.has(id) && fileCounts[id] > 0;
    sourceFiles[id] = enabledSources.has(id) ? filesBySource[id] : [];
  }

  const totalFiles = Object.values<number>(fileCounts).reduce((sum, count) => sum + count, 0);
  return {
    detection: { fileCounts, totalFiles, enabled, primaryLanguage: determinePrimaryLanguage(fileCounts, totalFiles) },
    sourceFiles,
  };
}

function determinePrimaryLanguage(fileCounts: Record<SourceLanguageId, number>, totalFiles: number): PrimaryLanguage {
  if (totalFiles === 0) return 'unknown';

  const counts = SOURCE_LANGUAGES.map(({ id }) => ({ id, count: fileCounts[id] }));
  const nonZero = counts.filter((c) => c.count > 0);
  if (nonZero.length === 1) return nonZero[0].id;

  const [top] = [...counts].sort((a, b) => b.count - a.count);
  return top.count / totalFiles >= MIXED_LANGUAGE_THRESHOLD ? top.id : 'mixed';
}
