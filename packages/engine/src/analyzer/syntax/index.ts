import path from 'node:path';
import { readFileContent } from '../../fileWalker';
import type { SimpleFileInfo } from '../../types';
import type { LanguageSyntaxSpec } from './spec';
import { extractStructure } from './structure';
import { withSyntaxTree } from './treeSitter';
import { CPP_SYNTAX } from './languages/cpp';
import { CSHARP_SYNTAX } from './languages/csharp';
import { GO_SYNTAX } from './languages/go';
import { JAVA_SYNTAX } from './languages/java';
import { PYTHON_SYNTAX } from './languages/python';
import { RUST_SYNTAX } from './languages/rust';

export type { LanguageSyntaxSpec } from './spec';

/** Languages parsed with Tree-sitter, keyed by the language catalog's IDs. */
export const SYNTAX_SPECS = {
  python: PYTHON_SYNTAX,
  go: GO_SYNTAX,
  csharp: CSHARP_SYNTAX,
  java: JAVA_SYNTAX,
  rust: RUST_SYNTAX,
  cpp: CPP_SYNTAX,
} as const satisfies Record<string, LanguageSyntaxSpec>;

export type SyntaxLanguageId = keyof typeof SYNTAX_SPECS;

/** Parse one file's structure; an empty or unreadable file yields an empty structure. */
export async function parseWithSyntax(spec: LanguageSyntaxSpec, filePath: string): Promise<SimpleFileInfo> {
  const content = await readFileContent(filePath);
  if (!content) return { filePath, classes: [], functions: [], imports: [], lineCount: 0, dependencies: [] };
  return withSyntaxTree(spec.grammar, content, (tree) => extractStructure(spec, tree.rootNode, filePath, content));
}

/** A directory parser for the language analyzers: files that fail to parse are skipped with a warning. */
export function syntaxDirectoryParser(spec: LanguageSyntaxSpec) {
  return async (files: string[]): Promise<SimpleFileInfo[]> => {
    const results: SimpleFileInfo[] = [];
    for (const file of files) {
      try {
        results.push(await parseWithSyntax(spec, file));
      } catch (error) {
        console.warn(`Warning: Failed to analyze ${spec.grammar} file ${path.basename(file)}:`, error);
      }
    }
    return results;
  };
}
