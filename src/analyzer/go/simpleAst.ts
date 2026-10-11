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
 * Go has no classes: a `type X struct` plus the `func (r *X) Method()` functions whose
 * receiver is X is treated as the class-like unit for God Class scoring.
 */

const GO_STRIP_OPTIONS = { stringDelimiters: ['"', "'", '`'], rawStringDelimiters: ['`'] };
// Go generics use [] and channel types use `<-`, so `<` must not count as nesting.
const GO_PARAM_NESTING: ReadonlyArray<readonly [string, string]> = [['(', ')'], ['[', ']']];
const CONSTRUCTOR_PREFIX = 'New';

const IMPORT_BLOCK_REGEX = /import\s*\(([^)]*)\)/g;
const IMPORT_SINGLE_REGEX = /import\s+(?:[A-Za-z_][A-Za-z0-9_]*\s+)?"([^"]+)"/g;
const IMPORT_LINE_REGEX = /(?:[A-Za-z_][A-Za-z0-9_]*\s+)?"([^"]+)"/g;
const STRUCT_HEADER_REGEX = /\btype\s+([A-Za-z_][A-Za-z0-9_]*)\s+struct\b/g;
const METHOD_HEADER_REGEX = /\bfunc\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s+\*?([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;
const TOPLEVEL_FUNC_REGEX = /\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;

interface StructAccumulator {
  lineCount: number;
  methods: Set<string>;
  propertyCount: number;
}

function extractImports(content: string): string[] {
  const blockImports = Array.from(content.matchAll(IMPORT_BLOCK_REGEX), (block) => captureAll(IMPORT_LINE_REGEX, block[1])).flat();
  const singleImports = captureAll(IMPORT_SINGLE_REGEX, content.replace(IMPORT_BLOCK_REGEX, ''));
  return unique([...blockImports, ...singleImports]);
}

function collectStructs(content: string): Map<string, StructAccumulator> {
  const structs = new Map<string, StructAccumulator>();
  for (const match of content.matchAll(STRUCT_HEADER_REGEX)) {
    const block = findBraceBlock(content, match.index + match[0].length - 1);
    let lineCount = 1;
    let propertyCount = 0;
    if (block) {
      const [open, close] = block;
      lineCount = offsetToLine(content, close) - offsetToLine(content, match.index) + 1;
      propertyCount = content
        .slice(open + 1, close)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0).length;
    }
    structs.set(match[1], { lineCount, methods: new Set(), propertyCount });
  }
  return structs;
}

function attachMethods(content: string, structs: Map<string, StructAccumulator>): void {
  for (const match of content.matchAll(METHOD_HEADER_REGEX)) {
    const [, receiverType, methodName] = match;
    const entry = structs.get(receiverType);
    if (entry) entry.methods.add(methodName);
    // A method on a struct declared in another file still counts toward that struct.
    else structs.set(receiverType, { lineCount: 0, methods: new Set([methodName]), propertyCount: 0 });
  }
}

export async function parseGoFile(filePath: string): Promise<SimpleFileInfo> {
  const rawContent = await readFileContent(filePath);
  if (!rawContent) {
    return { filePath, classes: [], functions: [], imports: [], lineCount: 0, dependencies: [] };
  }

  const content = stripComments(rawContent, GO_STRIP_OPTIONS);
  const imports = extractImports(content);
  const structs = collectStructs(content);
  attachMethods(content, structs);

  const classes: SimpleClassInfo[] = Array.from(structs.entries(), ([name, info]) => ({
    name,
    filePath,
    lineCount: info.lineCount,
    methodCount: info.methods.size,
    propertyCount: info.propertyCount,
    importCount: imports.length,
    constructorExists: content.includes(`func ${CONSTRUCTOR_PREFIX}${name}(`),
    methods: Array.from(info.methods),
    dependencies: imports,
  }));

  const functions: SimpleFunctionInfo[] = Array.from(content.replace(METHOD_HEADER_REGEX, '').matchAll(TOPLEVEL_FUNC_REGEX), (match) => ({
    name: match[1],
    lineCount: 0,
    paramCount: countTopLevelParams(match[2] ?? '', { nestingPairs: GO_PARAM_NESTING }),
  }));

  return { filePath, classes, functions, imports, lineCount: countLines(rawContent), dependencies: imports };
}

export async function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  const results: SimpleFileInfo[] = [];
  for (const file of files) {
    try {
      results.push(await parseGoFile(file));
    } catch (error) {
      console.warn(`Warning: Failed to analyze Go file ${path.basename(file)}:`, error);
    }
  }
  return results;
}
