import path from 'node:path';
import { readFileContent } from '../../fileWalker';
import type { SimpleClassInfo, SimpleFileInfo, SimpleFunctionInfo } from '../../types';
import {
  captureAll,
  countLines,
  countTopLevelParams,
  findBraceBlock,
  offsetToLine,
  stripComments,
  unique,
} from '../parsing/sourceText';

/**
 * A Rust struct's fields and its methods live in separate places (`struct Foo { ... }`
 * and one or more `impl Foo { ... }` blocks), so methods are paired with their struct by
 * type name — the same receiver-matching approach the Go parser uses. A struct's
 * lineCount covers only its field block, not its impl blocks.
 */

const CONSTRUCTOR_NAME = 'new';
// `self`/`&self`/`&mut self` is the receiver, not a parameter.
const SELF_RECEIVER = /^&?(mut\s+)?self$/;
const STRUCT_BODY_OR_END = /[;{]/;

const IMPORT_REGEX = /^\s*use\s+([A-Za-z_][A-Za-z0-9_:]*)/gm;
// `struct Foo { ... }`, `struct Foo;` or `struct Foo(...);`
const STRUCT_HEADER_REGEX = /\b(?:pub(?:\([^)]*\))?\s+)?struct\s+([A-Za-z_][A-Za-z0-9_]*)/g;
// `impl Foo {` or `impl<T> Trait for Foo<T> where ... {` — group 1 is the implementing type.
const IMPL_HEADER_REGEX = /\bimpl(?:\s*<[^>]*>)?\s+(?:[A-Za-z_][A-Za-z0-9_:]*(?:<[^>]*>)?\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:<[^>]*>)?\s*(?:where\s+[^{]+)?\{/g;
const METHOD_HEADER_REGEX = /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;

interface StructAccumulator {
  lineCount: number;
  methods: Set<string>;
  propertyCount: number;
  hasNew: boolean;
}

type Range = { start: number; end: number };

function emptyStruct(lineCount: number): StructAccumulator {
  return { lineCount, methods: new Set(), propertyCount: 0, hasNew: false };
}

/** Tuple and unit structs end with `;` before any `{`, so they have no field block. */
function hasFieldBlock(content: string, headerEnd: number): boolean {
  const terminator = content.slice(headerEnd).match(STRUCT_BODY_OR_END);
  return terminator?.[0] === '{';
}

function collectStructs(content: string, typeRanges: Range[]): Map<string, StructAccumulator> {
  const structs = new Map<string, StructAccumulator>();
  for (const match of content.matchAll(STRUCT_HEADER_REGEX)) {
    const headerEnd = match.index + match[0].length;
    const block = hasFieldBlock(content, headerEnd) ? findBraceBlock(content, headerEnd) : null;
    if (!block) {
      structs.set(match[1], emptyStruct(1));
      continue;
    }
    const [open, close] = block;
    const entry = emptyStruct(offsetToLine(content, close) - offsetToLine(content, match.index) + 1);
    entry.propertyCount = content
      .slice(open + 1, close)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0).length;
    structs.set(match[1], entry);
    typeRanges.push({ start: open, end: close });
  }
  return structs;
}

function attachImplMethods(content: string, structs: Map<string, StructAccumulator>, typeRanges: Range[]): void {
  for (const match of content.matchAll(IMPL_HEADER_REGEX)) {
    const block = findBraceBlock(content, match.index + match[0].length - 1);
    if (!block) continue;
    const [open, close] = block;
    typeRanges.push({ start: open, end: close });
    const entry = structs.get(match[1]) ?? emptyStruct(0);
    for (const methodName of captureAll(METHOD_HEADER_REGEX, content.slice(open + 1, close))) {
      entry.methods.add(methodName);
      if (methodName === CONSTRUCTOR_NAME) entry.hasNew = true;
    }
    structs.set(match[1], entry);
  }
}

export async function parseRustFile(filePath: string): Promise<SimpleFileInfo> {
  const rawContent = await readFileContent(filePath);
  if (!rawContent) {
    return { filePath, classes: [], functions: [], imports: [], lineCount: 0, dependencies: [] };
  }

  const content = stripComments(rawContent);
  const imports = unique(captureAll(IMPORT_REGEX, content));
  const typeRanges: Range[] = [];
  const structs = collectStructs(content, typeRanges);
  attachImplMethods(content, structs, typeRanges);

  const classes: SimpleClassInfo[] = Array.from(structs.entries(), ([name, info]) => ({
    name,
    filePath,
    lineCount: info.lineCount,
    methodCount: info.methods.size,
    propertyCount: info.propertyCount,
    importCount: imports.length,
    constructorExists: info.hasNew,
    methods: Array.from(info.methods),
    dependencies: imports,
  }));

  const functions: SimpleFunctionInfo[] = [];
  for (const match of content.matchAll(METHOD_HEADER_REGEX)) {
    if (typeRanges.some((r) => match.index > r.start && match.index < r.end)) continue;
    functions.push({
      name: match[1],
      lineCount: 0,
      paramCount: countTopLevelParams(match[2] ?? '', { isExcluded: (param) => SELF_RECEIVER.test(param) }),
    });
  }

  return { filePath, classes, functions, imports, lineCount: countLines(rawContent), dependencies: imports };
}

export async function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  const results: SimpleFileInfo[] = [];
  for (const file of files) {
    try {
      results.push(await parseRustFile(file));
    } catch (error) {
      console.warn(`Warning: Failed to analyze Rust file ${path.basename(file)}:`, error);
    }
  }
  return results;
}
