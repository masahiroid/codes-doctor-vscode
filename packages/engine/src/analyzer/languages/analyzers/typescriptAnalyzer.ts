import type { CallGraph, FileInfo } from '../../../types';
import { analyzeDirectory } from '../../typescript/ast';
import { buildCallGraph } from '../../typescript/callGraph';
import { LanguageAnalyzer, scoreGodClasses } from './types';

const EMPTY_CALL_GRAPH: CallGraph = { edges: [], nodes: [] };

export const analyzeTypeScript: LanguageAnalyzer<'typescript'> = async ({ repoPath, config, sourceFiles }) => {
  const paths = [...sourceFiles.typescript, ...sourceFiles.javascript];
  if (paths.length === 0) return { files: [], godClasses: [], callGraph: EMPTY_CALL_GRAPH };

  console.log(`\n[TypeScript/JavaScript] Parsing ${paths.length} files...`);
  try {
    const files: FileInfo[] = await analyzeDirectory(repoPath, paths);
    const godClasses = scoreGodClasses(files, (c) => c);
    const callGraph = config.features.callGraph && files.length > 0 ? await buildCallGraph(files) : EMPTY_CALL_GRAPH;
    console.log(`   [OK] ${files.length} files, ${godClasses.length} classes, ${callGraph.edges.length} call edges`);
    return { files, godClasses, callGraph };
  } catch (error) {
    console.error('   [ERROR] TS/JS analysis failed:', error);
    return { files: [], godClasses: [], callGraph: EMPTY_CALL_GRAPH };
  }
};
