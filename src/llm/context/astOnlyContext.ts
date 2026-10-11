import path from 'node:path';
import type { AnalysisResult, FileInfo, LanguageFileMap, ModuleMetrics, PHPFileInfo, SimpleFileInfo } from '../../types';
import { LANGUAGES, LanguageId } from '../../analyzer/languages/catalog';

const MAX_FILES_PER_LANGUAGE = 8;
/** Weight applied to module coupling (fanIn+fanOut) when ranking files by code complexity */
const COUPLING_WEIGHT = 2;

export interface AstOnlyLlmContext {
  analysisId: string;
  repoName: string;
  analyzedAt: string;
  primaryLanguage: string;
  mode: 'ast-only';
  astData: Record<LanguageId, SampledLanguageFiles>;
}

interface SampledLanguageFiles {
  sampledCount: number;
  totalCount: number;
  files: Array<{
    filePath: string;
    complexity: number;
    cyclomaticComplexity?: number;
    ast: unknown;
  }>;
}

interface FileLike {
  filePath: string;
  lineCount: number;
  classes: unknown[];
  functions: unknown[];
}

/** What a sampled file contributes besides its path and complexity. */
type FileSampler<F> = (file: F, result: AnalysisResult) => { ast: unknown; cyclomaticComplexity?: number };

/**
 * Code complexity = actual code volume * content richness.
 * fanIn+fanOut measures module coupling, NOT code complexity — used only as a
 * secondary weight. Files with 0 classes and 0 functions are pure type/constant
 * definitions and should sort last.
 */
function getCodeComplexity(fileInfo: FileLike, moduleMetrics: ModuleMetrics[]): number {
  const codeItems = fileInfo.classes.length + fileInfo.functions.length;
  if (codeItems === 0) return 0;
  const metric = moduleMetrics.find((m) => m.filePath === fileInfo.filePath);
  const coupling = metric ? metric.fanIn + metric.fanOut : 0;
  return fileInfo.lineCount + coupling * COUPLING_WEIGHT;
}

function buildTypeScriptAstStructure(fileInfo: FileInfo) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    imports: fileInfo.imports,
    exports: [],
    classes: fileInfo.classes.map((c) => ({
      name: c.name,
      methods: c.methods,
      lineCount: c.lineCount,
    })),
    functions: fileInfo.functions.map((f) => ({
      name: f.name,
      paramCount: f.paramCount,
      lineCount: f.lineCount,
    })),
  };
}

function buildPhpAstStructure(fileInfo: PHPFileInfo) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    dependencies: fileInfo.dependencies,
    classes: fileInfo.classes.map((c) => ({
      name: c.name,
      namespace: c.namespace,
      methods: c.methods,
      lineCount: c.lineCount,
    })),
    functions: fileInfo.functions.map((f) => ({
      name: f.name,
      lineCount: f.lineCount,
    })),
  };
}

/** Every lightweight-parsed language shares one file shape, so it shares one structure. */
function buildLightweightAstStructure(fileInfo: SimpleFileInfo) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    imports: fileInfo.imports,
    dependencies: fileInfo.dependencies,
    classes: fileInfo.classes.map((c) => ({
      name: c.name,
      methods: c.methods,
      lineCount: c.lineCount,
    })),
    functions: fileInfo.functions.map((f) => ({
      name: f.name,
      paramCount: f.paramCount,
      lineCount: f.lineCount,
    })),
  };
}

/** TypeScript samples also carry the worst cyclomatic complexity among the file's God Class candidates. */
const sampleTypeScriptFile: FileSampler<FileInfo> = (file, result) => {
  const fileGodClasses = result.godClasses.filter((gc) => gc.filePath === file.filePath);
  const maxCc = fileGodClasses.length > 0
    ? Math.max(...fileGodClasses.map((c) => c.cyclomaticComplexity || 0))
    : undefined;
  return { cyclomaticComplexity: maxCc && maxCc > 0 ? maxCc : undefined, ast: buildTypeScriptAstStructure(file) };
};

const sampleLightweightFile: FileSampler<SimpleFileInfo> = (file) => ({ ast: buildLightweightAstStructure(file) });

const FILE_SAMPLERS: { [K in LanguageId]: FileSampler<LanguageFileMap[K][number]> } = {
  typescript: sampleTypeScriptFile,
  php: (file) => ({ ast: buildPhpAstStructure(file) }),
  dart: sampleLightweightFile,
  python: sampleLightweightFile,
  go: sampleLightweightFile,
  swift: sampleLightweightFile,
  csharp: sampleLightweightFile,
  java: sampleLightweightFile,
  kotlin: sampleLightweightFile,
  rust: sampleLightweightFile,
  cpp: sampleLightweightFile,
};

/** The most complex files of one language, most complex first. */
function sampleLanguage<K extends LanguageId>(id: K, result: AnalysisResult): SampledLanguageFiles {
  const languageFiles: ReadonlyArray<LanguageFileMap[K][number]> = result.files[id];
  const sampler = FILE_SAMPLERS[id] as FileSampler<LanguageFileMap[K][number]>;
  const complexity = (file: FileLike) => getCodeComplexity(file, result.moduleMetrics);
  const files = [...languageFiles]
    .sort((a, b) => complexity(b) - complexity(a))
    .slice(0, MAX_FILES_PER_LANGUAGE)
    .map((file) => {
      const { ast, cyclomaticComplexity } = sampler(file, result);
      return { filePath: file.filePath, complexity: complexity(file), cyclomaticComplexity, ast };
    });

  return { sampledCount: files.length, totalCount: languageFiles.length, files };
}

export function buildAstOnlyLlmContext(result: AnalysisResult): AstOnlyLlmContext {
  return {
    analysisId: result.analysisId,
    repoName: path.basename(result.repoPath),
    analyzedAt: result.analyzedAt,
    primaryLanguage: result.detectedLanguages.primaryLanguage,
    mode: 'ast-only',
    astData: Object.fromEntries(LANGUAGES.map(({ id }) => [id, sampleLanguage(id, result)])) as AstOnlyLlmContext['astData'],
  };
}
