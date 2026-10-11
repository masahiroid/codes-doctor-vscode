import type { ParsedFile } from '../../types';
import { resolveInternalImport } from '../../analyzer/dependencies/resolveImport';

const TOP_DEPENDENTS_LIST_SIZE = 10;

export interface DependencyGraphContext {
  totalFilesWithDeps: number;
  totalInternalDeps: number;
  topDependents: Array<{ filePath: string; depCount: number }>;
}

export function buildDependencyGraphContext(allFiles: readonly ParsedFile[]): DependencyGraphContext {
  const depCounts = allFiles.map((f) => {
    // Only imports that resolve to an analyzed file are internal dependencies.
    const deps = 'dependencies' in f ? f.dependencies : f.imports.filter((specifier) => resolveInternalImport(f.filePath, specifier, allFiles));
    return { filePath: f.filePath, depCount: deps.length };
  });

  const totalFilesWithDeps = depCounts.filter((d) => d.depCount > 0).length;
  const totalInternalDeps = depCounts.reduce((sum, d) => sum + d.depCount, 0);
  const topDependents = [...depCounts]
    .sort((a, b) => b.depCount - a.depCount)
    .slice(0, TOP_DEPENDENTS_LIST_SIZE);

  return { totalFilesWithDeps, totalInternalDeps, topDependents };
}
