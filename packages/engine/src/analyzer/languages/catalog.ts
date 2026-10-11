import type { LanguageFileMap, ParsedFile } from '../../types';

/**
 * Single source of truth for every supported language: which files belong to it,
 * how it is labelled, and which cross-language stages (security scan, layer heatmap)
 * consume its parse results. Adding a language starts here; per-concern tables keyed by
 * `LanguageId` (analyzers, AST previews, LLM samplers) then fail to compile until the
 * new language is handled everywhere it must be.
 */

/** A file-extension family found during detection (TypeScript and JavaScript are separate). */
export const SOURCE_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript', extensions: ['.ts', '.tsx'] },
  { id: 'javascript', label: 'JavaScript', extensions: ['.js', '.jsx'] },
  { id: 'php', label: 'PHP', extensions: ['.php'] },
  { id: 'dart', label: 'Dart', extensions: ['.dart'] },
  { id: 'python', label: 'Python', extensions: ['.py'] },
  { id: 'go', label: 'Go', extensions: ['.go'] },
  { id: 'swift', label: 'Swift', extensions: ['.swift'] },
  { id: 'csharp', label: 'C#', extensions: ['.cs'] },
  { id: 'java', label: 'Java', extensions: ['.java'] },
  { id: 'kotlin', label: 'Kotlin', extensions: ['.kt', '.kts'] },
  { id: 'rust', label: 'Rust', extensions: ['.rs'] },
  // `.h`/`.c` are deliberately absent: they may be plain C, which the C++ parser does not model.
  { id: 'cpp', label: 'C++', extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh'] },
] as const;

export type SourceLanguageId = (typeof SOURCE_LANGUAGES)[number]['id'];

/** `auto` plus every source language; the value of the "analysis language" setting. */
export type AnalysisLanguage = SourceLanguageId | 'auto';
export const AUTO_LANGUAGE = 'auto';
export const ANALYSIS_LANGUAGES: readonly AnalysisLanguage[] = [AUTO_LANGUAGE, ...SOURCE_LANGUAGES.map((l) => l.id)];

/**
 * Which source languages a forced (non-auto) mode enables. TypeScript mode keeps its
 * historical "TypeScript/JavaScript" meaning; every other mode enables only itself.
 */
const FORCED_MODE_OVERRIDES: Partial<Record<SourceLanguageId, readonly SourceLanguageId[]>> = {
  typescript: ['typescript', 'javascript'],
};

export function enabledSourcesFor(mode: AnalysisLanguage): ReadonlySet<SourceLanguageId> {
  if (mode === AUTO_LANGUAGE) return new Set(SOURCE_LANGUAGES.map((l) => l.id));
  return new Set(FORCED_MODE_OVERRIDES[mode] ?? [mode]);
}

/** Validate an untrusted language value (query string, setting) at the system boundary. */
export function toAnalysisLanguage(value: unknown): AnalysisLanguage {
  if (value === undefined || value === null || value === '') return AUTO_LANGUAGE;
  if (typeof value === 'string' && (ANALYSIS_LANGUAGES as readonly string[]).includes(value)) {
    return value as AnalysisLanguage;
  }
  throw new Error(`Unsupported analysis language: ${String(value)}`);
}

/** Security pattern families; see analyzer/security/patterns.ts. */
export type SecurityLanguage = 'typescript' | 'php' | 'python' | 'go' | 'swift' | 'csharp' | 'java' | 'kotlin' | 'rust' | 'cpp';

/**
 * How a language's dependency strings feed the layer heatmap: `path` dependencies are
 * resolved file paths, `keyword` dependencies are module/namespace names matched by keyword.
 */
export type LayerDependencyStyle = 'path' | 'keyword';

export interface LanguageDefinition {
  /** Key of this language's parse results in `AnalysisResult.files`. */
  id: keyof LanguageFileMap;
  label: string;
  /** Source languages whose files this language's analyzer parses. */
  sources: readonly SourceLanguageId[];
  /** Full AST parser, or a lightweight regex-based structural scan. */
  parser: 'ast' | 'lightweight';
  security?: SecurityLanguage;
  layerDependencies?: LayerDependencyStyle;
}

/** Analysis languages in pipeline order; this order is the order of every combined file list. */
export const LANGUAGES = [
  { id: 'typescript', label: 'TypeScript/JavaScript', sources: ['typescript', 'javascript'], parser: 'ast', security: 'typescript', layerDependencies: 'path' },
  { id: 'php', label: 'PHP', sources: ['php'], parser: 'ast', security: 'php', layerDependencies: 'keyword' },
  { id: 'dart', label: 'Dart', sources: ['dart'], parser: 'lightweight', layerDependencies: 'keyword' },
  { id: 'python', label: 'Python', sources: ['python'], parser: 'lightweight', security: 'python', layerDependencies: 'keyword' },
  { id: 'go', label: 'Go', sources: ['go'], parser: 'lightweight', security: 'go', layerDependencies: 'keyword' },
  { id: 'swift', label: 'Swift', sources: ['swift'], parser: 'lightweight', security: 'swift', layerDependencies: 'keyword' },
  { id: 'csharp', label: 'C#', sources: ['csharp'], parser: 'lightweight', security: 'csharp', layerDependencies: 'keyword' },
  { id: 'java', label: 'Java', sources: ['java'], parser: 'lightweight', security: 'java', layerDependencies: 'keyword' },
  { id: 'kotlin', label: 'Kotlin', sources: ['kotlin'], parser: 'lightweight', security: 'kotlin', layerDependencies: 'keyword' },
  { id: 'rust', label: 'Rust', sources: ['rust'], parser: 'lightweight', security: 'rust', layerDependencies: 'keyword' },
  { id: 'cpp', label: 'C++', sources: ['cpp'], parser: 'lightweight', security: 'cpp', layerDependencies: 'keyword' },
] as const satisfies readonly LanguageDefinition[];

export type LanguageId = (typeof LANGUAGES)[number]['id'];

export function emptyLanguageFiles(): LanguageFileMap {
  return Object.fromEntries(LANGUAGES.map((l) => [l.id, []])) as unknown as LanguageFileMap;
}

/** Every parsed file across all languages, in pipeline order. */
export function allLanguageFiles(files: Partial<LanguageFileMap>): ParsedFile[] {
  return LANGUAGES.flatMap((l): readonly ParsedFile[] => files[l.id] ?? []);
}
