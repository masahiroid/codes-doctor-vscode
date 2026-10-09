import path from 'node:path';
import { AnalysisResult, ModuleMetrics } from '../../types';

const MAX_FILES_PER_LANGUAGE = 8;
/** Weight applied to module coupling (fanIn+fanOut) when ranking files by code complexity */
const COUPLING_WEIGHT = 2;

export interface AstOnlyLlmContext {
  analysisId: string;
  repoName: string;
  analyzedAt: string;
  primaryLanguage: string;
  mode: 'ast-only';
  astData: {
    typescript: SampledLanguageFiles;
    php: SampledLanguageFiles;
    dart: SampledLanguageFiles;
    python: SampledLanguageFiles;
  };
}

interface SampledLanguageFiles {
  sampledCount: number;
  totalCount: number;
  files: Array<{
    filePath: string;
    complexity: number;
    cyclomaticComplexity?: number;
    ast: any;
  }>;
}

interface FileLike {
  filePath: string;
  lineCount: number;
  classes: unknown[];
  functions: unknown[];
}

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

function buildTypeScriptAstStructure(fileInfo: any) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    imports: fileInfo.imports,
    exports: [],
    classes: fileInfo.classes.map((c: any) => ({
      name: c.name,
      methods: c.methods,
      lineCount: c.lineCount,
      complexity: c.complexity,
    })),
    functions: fileInfo.functions.map((f: any) => ({
      name: f.name,
      paramCount: f.paramCount,
      lineCount: f.lineCount,
    })),
  };
}

function buildPhpAstStructure(fileInfo: any) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    dependencies: fileInfo.dependencies,
    classes: fileInfo.classes.map((c: any) => ({
      name: c.name,
      namespace: c.namespace,
      methods: c.methods,
      lineCount: c.lineCount,
    })),
    functions: fileInfo.functions.map((f: any) => ({
      name: f.name,
      lineCount: f.lineCount,
    })),
  };
}

function buildDartAstStructure(fileInfo: any) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    imports: fileInfo.imports,
    dependencies: fileInfo.dependencies,
    classes: fileInfo.classes.map((c: any) => ({
      name: c.name,
      methods: c.methods,
      lineCount: c.lineCount,
    })),
    functions: fileInfo.functions.map((f: any) => ({
      name: f.name,
      paramCount: f.paramCount,
      lineCount: f.lineCount,
    })),
  };
}

function buildPythonAstStructure(fileInfo: any) {
  return {
    type: 'Program',
    filePath: fileInfo.filePath,
    lineCount: fileInfo.lineCount,
    imports: fileInfo.imports,
    dependencies: fileInfo.dependencies,
    classes: fileInfo.classes.map((c: any) => ({
      name: c.name,
      methods: c.methods,
      lineCount: c.lineCount,
    })),
    functions: fileInfo.functions.map((f: any) => ({
      name: f.name,
      paramCount: f.paramCount,
      lineCount: f.lineCount,
    })),
  };
}

function sampleTypeScriptFiles(
  tsFiles: AnalysisResult['tsFiles'],
  moduleMetrics: ModuleMetrics[],
  godClasses: AnalysisResult['godClasses']
): SampledLanguageFiles {
  const sorted = [...tsFiles].sort(
    (a, b) => getCodeComplexity(b, moduleMetrics) - getCodeComplexity(a, moduleMetrics)
  );
  const files = sorted.slice(0, MAX_FILES_PER_LANGUAGE).map((f) => {
    const fileGodClasses = godClasses.filter((gc) => gc.filePath === f.filePath);
    const maxCc = fileGodClasses.length > 0
      ? Math.max(...fileGodClasses.map((c) => c.cyclomaticComplexity || 0))
      : undefined;

    return {
      filePath: f.filePath,
      complexity: getCodeComplexity(f, moduleMetrics),
      cyclomaticComplexity: maxCc && maxCc > 0 ? maxCc : undefined,
      ast: buildTypeScriptAstStructure(f),
    };
  });

  return { sampledCount: files.length, totalCount: tsFiles.length, files };
}

function samplePhpFiles(
  phpFiles: AnalysisResult['phpFiles'],
  moduleMetrics: ModuleMetrics[]
): SampledLanguageFiles {
  const sorted = [...phpFiles].sort(
    (a, b) => getCodeComplexity(b, moduleMetrics) - getCodeComplexity(a, moduleMetrics)
  );
  const files = sorted.slice(0, MAX_FILES_PER_LANGUAGE).map((f) => ({
    filePath: f.filePath,
    complexity: getCodeComplexity(f, moduleMetrics),
    ast: buildPhpAstStructure(f),
  }));

  return { sampledCount: files.length, totalCount: phpFiles.length, files };
}

function sampleDartFiles(
  dartFiles: AnalysisResult['dartFiles'],
  moduleMetrics: ModuleMetrics[]
): SampledLanguageFiles {
  const sorted = [...dartFiles].sort(
    (a, b) => getCodeComplexity(b, moduleMetrics) - getCodeComplexity(a, moduleMetrics)
  );
  const files = sorted.slice(0, MAX_FILES_PER_LANGUAGE).map((f) => ({
    filePath: f.filePath,
    complexity: getCodeComplexity(f, moduleMetrics),
    ast: buildDartAstStructure(f),
  }));

  return { sampledCount: files.length, totalCount: dartFiles.length, files };
}

function samplePythonFiles(
  pythonFiles: AnalysisResult['pythonFiles'],
  moduleMetrics: ModuleMetrics[]
): SampledLanguageFiles {
  const sorted = [...pythonFiles].sort(
    (a, b) => getCodeComplexity(b, moduleMetrics) - getCodeComplexity(a, moduleMetrics)
  );
  const files = sorted.slice(0, MAX_FILES_PER_LANGUAGE).map((f) => ({
    filePath: f.filePath,
    complexity: getCodeComplexity(f, moduleMetrics),
    ast: buildPythonAstStructure(f),
  }));

  return { sampledCount: files.length, totalCount: pythonFiles.length, files };
}

export function buildAstOnlyLlmContext(result: AnalysisResult): AstOnlyLlmContext {
  return {
    analysisId: result.analysisId,
    repoName: path.basename(result.repoPath),
    analyzedAt: result.analyzedAt,
    primaryLanguage: result.detectedLanguages.primaryLanguage,
    mode: 'ast-only',
    astData: {
      typescript: sampleTypeScriptFiles(result.tsFiles, result.moduleMetrics, result.godClasses),
      php: samplePhpFiles(result.phpFiles, result.moduleMetrics),
      dart: sampleDartFiles(result.dartFiles, result.moduleMetrics),
      python: samplePythonFiles(result.pythonFiles, result.moduleMetrics),
    },
  };
}
