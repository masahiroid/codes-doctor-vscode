import path from 'node:path';
import { LayerHeatmap, LayerInfo, GodClassResult } from '../types';
import type { LayerDependencyStyle } from './languages/catalog';

/** Directory-name patterns used to classify a file path into an architectural layer. */
const LAYER_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\/(components?|ui|views?)\//i, name: 'Presentation' },
  { pattern: /\/(services?|business|domain)\//i, name: 'Business Logic' },
  { pattern: /\/(repositories?|dao|data|persistence)\//i, name: 'Data Access' },
  { pattern: /\/(models?|entities?|types?|dto)\//i, name: 'Models' },
  { pattern: /\/(utils?|helpers?|common|shared)\//i, name: 'Utilities' },
  { pattern: /\/(api|controllers?|routes?|endpoints?)\//i, name: 'API Layer' },
  { pattern: /\/(middleware|guards?|interceptors?)\//i, name: 'Middleware' },
  { pattern: /\/(config|settings?|constants?)\//i, name: 'Configuration' },
  { pattern: /\/(tests?|specs?|__tests__|__mocks__)\//i, name: 'Tests' },
];

/** Keyword patterns used to guess a layer from a dependency string (e.g. a PHP `use` path) */
const DEPENDENCY_LAYER_KEYWORDS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /service|business|domain/i, name: 'Business Logic' },
  { pattern: /repository|dao|data|persistence|database/i, name: 'Data Access' },
  { pattern: /model|entity|type|dto/i, name: 'Models' },
  { pattern: /component|ui|view|page/i, name: 'Presentation' },
  { pattern: /api|controller|route|endpoint/i, name: 'API Layer' },
  { pattern: /middleware|guard|interceptor/i, name: 'Middleware' },
  { pattern: /config|setting|constant/i, name: 'Configuration' },
  { pattern: /util|helper|common|shared/i, name: 'Utilities' },
];

/** Typical layer ordering for display purposes; layers not listed sort alphabetically after these. */
const LAYER_DISPLAY_ORDER = [
  'Presentation',
  'API Layer',
  'Middleware',
  'Business Logic',
  'Data Access',
  'Models',
  'Utilities',
  'Configuration',
];

/** God score assumed for a file with no detected God Classes, to avoid skewing the layer average to 0 */
const DEFAULT_FILE_COMPLEXITY = 50;

interface LayerAccumulator {
  fileCount: number;
  classCount: number;
  complexitySum: number;
  dependencies: Set<string>;
  files: string[];
}

interface AnalyzableFile {
  filePath: string;
  /** File-level imports; only consulted for `keyword`-style languages. */
  dependencies?: string[];
  classes: Array<{ dependencies: string[] }>;
}

/** One language's parsed files plus how its dependency strings map to layers. */
export interface LayerSource {
  files: readonly AnalyzableFile[];
  dependencyStyle: LayerDependencyStyle;
}

/**
 * Analyze architectural layers and generate heatmap. When `repoPath` is given, file
 * paths are made repo-relative first so that directories above the repository
 * (e.g. `/Users/me/projects/`) cannot be mistaken for layers.
 */
export function generateLayerHeatmap(
  sources: readonly LayerSource[],
  godClasses: GodClassResult[],
  repoPath?: string
): LayerHeatmap {
  const toRelative = repoPath ? relativizer(repoPath) : <T extends { filePath: string }>(item: T) => item;
  const relativeSources = sources.map((source) => ({ ...source, files: source.files.map(toRelative) }));
  const relativeGodClasses = godClasses.map(toRelative);

  const layers = detectLayers(relativeSources.flatMap((source) => source.files), relativeGodClasses);
  const matrix = buildDependencyMatrix(layers, relativeSources);

  return { layers, matrix };
}

function relativizer(repoPath: string) {
  return <T extends { filePath: string }>(item: T): T => ({
    ...item,
    filePath: path.relative(repoPath, item.filePath).split(path.sep).join('/'),
  });
}

/**
 * Detect architectural layers from file paths and aggregate per-layer stats.
 */
function detectLayers(files: readonly AnalyzableFile[], godClasses: GodClassResult[]): LayerInfo[] {
  const layerMap = new Map<string, LayerAccumulator>();

  for (const fileInfo of files) {
    accumulateFileIntoLayer(layerMap, fileInfo, godClasses);
  }

  return Array.from(layerMap.entries())
    .map(([name, data]) => ({
      name,
      fileCount: data.fileCount,
      classCount: data.classCount,
      avgComplexity: Math.round(data.complexitySum / data.fileCount),
      dependencies: Array.from(data.dependencies),
    }))
    .sort(compareByDisplayOrder);
}

function accumulateFileIntoLayer(
  layerMap: Map<string, LayerAccumulator>,
  fileInfo: AnalyzableFile,
  godClasses: GodClassResult[]
): void {
  const layerName = detectLayerName(fileInfo.filePath);

  if (!layerMap.has(layerName)) {
    layerMap.set(layerName, {
      fileCount: 0,
      classCount: 0,
      complexitySum: 0,
      dependencies: new Set(),
      files: [],
    });
  }

  const layer = layerMap.get(layerName)!;
  layer.fileCount++;
  layer.classCount += fileInfo.classes.length;
  layer.files.push(fileInfo.filePath);
  layer.complexitySum += averageGodScoreForFile(fileInfo.filePath, godClasses);

  for (const classInfo of fileInfo.classes) {
    for (const dep of classInfo.dependencies) {
      const depLayer = detectLayerName(dep);
      if (depLayer !== layerName) {
        layer.dependencies.add(depLayer);
      }
    }
  }
}

function averageGodScoreForFile(filePath: string, godClasses: GodClassResult[]): number {
  const fileGodClasses = godClasses.filter((gc) => gc.filePath === filePath);
  if (fileGodClasses.length === 0) return DEFAULT_FILE_COMPLEXITY;
  const total = fileGodClasses.reduce((sum, gc) => sum + gc.godScore, 0);
  return total / fileGodClasses.length;
}

function compareByDisplayOrder(a: LayerInfo, b: LayerInfo): number {
  const aIndex = LAYER_DISPLAY_ORDER.indexOf(a.name);
  const bIndex = LAYER_DISPLAY_ORDER.indexOf(b.name);
  if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
  if (aIndex !== -1) return -1;
  if (bIndex !== -1) return 1;
  return a.name.localeCompare(b.name);
}

/**
 * Detect layer name from a file path using directory-name patterns, falling back
 * to the first path segment, or "Other" for a bare filename.
 */
function detectLayerName(filePath: string): string {
  for (const { pattern, name } of LAYER_PATTERNS) {
    // Leading slash lets a top-level directory (`services/x.ts`) match `/services/`.
    if (pattern.test('/' + filePath)) {
      return name;
    }
  }

  const parts = filePath.split('/').filter((p) => p && p !== '.' && p !== '..');
  if (parts.length > 1) {
    const dir = parts[0];
    return dir.charAt(0).toUpperCase() + dir.slice(1);
  }

  return 'Other';
}

/**
 * Guess layer names referenced by a dependency string (e.g. a PHP `use` statement)
 * using keyword matching, since such strings rarely contain a real directory path.
 */
function extractLayersFromDependencies(depStrings: string[]): Set<string> {
  const foundLayers = new Set<string>();

  for (const depStr of depStrings) {
    for (const { pattern, name } of DEPENDENCY_LAYER_KEYWORDS) {
      if (pattern.test(depStr)) {
        foundLayers.add(name);
      }
    }
  }

  return foundLayers;
}

/**
 * Build a layer x layer dependency count matrix.
 */
function buildDependencyMatrix(layers: LayerInfo[], sources: readonly LayerSource[]): number[][] {
  const size = layers.length;
  const matrix: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));

  const layerIndex = new Map<string, number>();
  layers.forEach((layer, index) => {
    layerIndex.set(layer.name, index);
  });

  const addEdge = (sourceLayer: string, targetLayer: string): void => {
    const sourceIndex = layerIndex.get(sourceLayer);
    const targetIndex = layerIndex.get(targetLayer);
    if (sourceIndex !== undefined && targetIndex !== undefined && sourceIndex !== targetIndex) {
      matrix[sourceIndex][targetIndex]++;
    }
  };

  for (const source of sources) {
    for (const fileInfo of source.files) {
      const sourceLayer = detectLayerName(fileInfo.filePath);
      for (const targetLayer of dependencyLayersOf(fileInfo, source.dependencyStyle)) {
        addEdge(sourceLayer, targetLayer);
      }
    }
  }

  return matrix;
}

/** Target layers referenced by one file, in the order the matrix has always counted them. */
function dependencyLayersOf(fileInfo: AnalyzableFile, style: LayerDependencyStyle): string[] {
  if (style === 'path') {
    return fileInfo.classes.flatMap((classInfo) => classInfo.dependencies.map(detectLayerName));
  }
  return [
    ...extractLayersFromDependencies(fileInfo.dependencies ?? []),
    ...fileInfo.classes.flatMap((classInfo) => [...extractLayersFromDependencies(classInfo.dependencies)]),
  ];
}
