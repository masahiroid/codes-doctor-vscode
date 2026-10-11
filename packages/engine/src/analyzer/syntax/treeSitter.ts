import path from 'node:path';
import type { Language as TreeSitterLanguage, Node, Parser as TreeSitterParser, Tree } from '@vscode/tree-sitter-wasm';

export type { Node, Tree };

/** Grammars shipped by @vscode/tree-sitter-wasm that the engine parses with. */
export const GRAMMARS = {
  go: 'tree-sitter-go.wasm',
  python: 'tree-sitter-python.wasm',
  java: 'tree-sitter-java.wasm',
  csharp: 'tree-sitter-c-sharp.wasm',
  rust: 'tree-sitter-rust.wasm',
  cpp: 'tree-sitter-cpp.wasm',
} as const;

export type GrammarId = keyof typeof GRAMMARS;

type TreeSitterModule = typeof import('@vscode/tree-sitter-wasm');

/** Directory holding the runtime (tree-sitter.js/.wasm) and the grammar .wasm files. */
function wasmDir(): string {
  return path.join(path.dirname(require.resolve('@vscode/tree-sitter-wasm/package.json')), 'wasm');
}

let runtime: Promise<TreeSitterModule> | undefined;
const languages = new Map<GrammarId, Promise<TreeSitterLanguage>>();

function loadRuntime(): Promise<TreeSitterModule> {
  runtime ??= (async () => {
    const module: TreeSitterModule = require('@vscode/tree-sitter-wasm');
    await module.Parser.init({ locateFile: () => path.join(wasmDir(), 'tree-sitter.wasm') });
    return module;
  })();
  return runtime;
}

function loadLanguage(grammar: GrammarId): Promise<TreeSitterLanguage> {
  let language = languages.get(grammar);
  if (!language) {
    language = loadRuntime().then((module) => module.Language.load(path.join(wasmDir(), GRAMMARS[grammar])));
    languages.set(grammar, language);
  }
  return language;
}

/** A parser for one grammar. Parsers are reused; trees must be deleted after use. */
export async function createParser(grammar: GrammarId): Promise<TreeSitterParser> {
  const [module, language] = await Promise.all([loadRuntime(), loadLanguage(grammar)]);
  const parser = new module.Parser();
  parser.setLanguage(language);
  return parser;
}

/** Parse source text, run `use` on the tree, and free the tree's WebAssembly memory. */
export async function withSyntaxTree<T>(grammar: GrammarId, content: string, use: (tree: Tree) => T): Promise<T> {
  const parser = await parserFor(grammar);
  const tree = parser.parse(content);
  if (!tree) throw new Error(`Tree-sitter could not parse ${grammar} source`);
  try {
    return use(tree);
  } finally {
    tree.delete();
  }
}

const parsers = new Map<GrammarId, Promise<TreeSitterParser>>();

function parserFor(grammar: GrammarId): Promise<TreeSitterParser> {
  let parser = parsers.get(grammar);
  if (!parser) {
    parser = createParser(grammar);
    parsers.set(grammar, parser);
  }
  return parser;
}

/** Named children of a node (the grammar's meaningful nodes, without punctuation). */
export function namedChildren(node: Node): Node[] {
  return node.namedChildren.filter((child): child is Node => child !== null);
}

/** Depth-first walk over named nodes; returning false from `visit` skips the subtree. */
export function walk(node: Node, visit: (node: Node) => boolean | void): void {
  if (visit(node) === false) return;
  for (const child of namedChildren(node)) walk(child, visit);
}
