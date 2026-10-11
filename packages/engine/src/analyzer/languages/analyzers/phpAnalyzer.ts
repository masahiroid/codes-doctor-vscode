import type { CallGraph, PHPFileInfo } from '../../../types';
import { analyzeDirectory } from '../../php/astRunner';
import { buildPHPCallGraph } from '../../php/callGraph';
import { LanguageAnalyzer, scoreGodClasses } from './types';

function mergeCallGraphs(base: CallGraph, addition: CallGraph): CallGraph {
  return { edges: [...base.edges, ...addition.edges], nodes: [...base.nodes, ...addition.nodes] };
}

export const analyzePhp: LanguageAnalyzer<'php'> = async ({ config, sourceFiles, callGraph }) => {
  const paths = sourceFiles.php;
  if (paths.length === 0 || !config.features.phpAnalysis) return { files: [], godClasses: [] };

  console.log(`\n[PHP] Parsing ${paths.length} files...`);
  try {
    const files: PHPFileInfo[] = await analyzeDirectory(paths);
    // PHP `use` statements play the role imports play in other languages.
    const godClasses = scoreGodClasses(files, (c) => ({ ...c, importCount: c.useCount }));
    const merged = config.features.callGraph && files.length > 0 ? mergeCallGraphs(callGraph, await buildPHPCallGraph(files)) : callGraph;
    console.log(`   [OK] ${files.length} files, ${godClasses.length} classes`);
    return { files, godClasses, callGraph: merged };
  } catch (error) {
    console.error('   [ERROR] PHP analysis failed:', error);
    return { files: [], godClasses: [] };
  }
};
