import type { AppConfig } from '../../../config';
import type { CallGraph, GodClassResult, LanguageFileMap } from '../../../types';
import type { LanguageId, SourceLanguageId } from '../catalog';
import { calculateGodScore } from '../../typescript/godScore';

export interface LanguageAnalysisContext {
  repoPath: string;
  config: AppConfig;
  /** Files per source language; already empty for languages the analysis mode excludes. */
  sourceFiles: Record<SourceLanguageId, string[]>;
  /** Call graph accumulated by the languages analyzed before this one. */
  callGraph: CallGraph;
}

export interface LanguageAnalysisOutput<K extends LanguageId> {
  files: LanguageFileMap[K];
  godClasses: GodClassResult[];
  /** The call graph after this language's contribution; omitted when unchanged. */
  callGraph?: CallGraph;
}

export type LanguageAnalyzer<K extends LanguageId> = (context: LanguageAnalysisContext) => Promise<LanguageAnalysisOutput<K>>;

/** The class fields God scoring needs, normalized across languages. */
export interface ScorableClass {
  name: string;
  filePath: string;
  lineCount: number;
  methodCount: number;
  propertyCount: number;
  importCount: number;
}

export function scoreGodClasses<C>(files: ReadonlyArray<{ classes: readonly C[] }>, toScorable: (classInfo: C) => ScorableClass): GodClassResult[] {
  return files.flatMap((file) => file.classes.map((classInfo) => calculateGodScore(toScorable(classInfo))));
}
