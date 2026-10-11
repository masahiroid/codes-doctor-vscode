import path from 'node:path';
import { readFileContent } from '../../fileWalker';
import type { SimpleClassInfo, SimpleFileInfo, SimpleFunctionInfo } from '../../types';
import { captureAll, countLines, unique } from '../parsing/sourceText';

const IMPORT_REGEX = /^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm;
const CLASS_REGEX = /\b(class|mixin|extension|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const METHOD_REGEX = /(?:^|\n)\s*(?:@[A-Za-z0-9_().,\s]+)?\s*(?:static\s+)?(?:[A-Za-z_<>{}\[\]?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
const FUNCTION_REGEX = /(?:^|\n)\s*(?:@[A-Za-z0-9_().,\s]+)?\s*(?:[A-Za-z_<>{}\[\]?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:async\s*)?(?:=>|\{)/g;
/** Control-flow keywords that FUNCTION_REGEX can mistake for function names. */
const NON_FUNCTION_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'new']);

function extractImports(content: string): string[] {
  return unique(captureAll(IMPORT_REGEX, content));
}

function findBlockEnd(content: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return content.length - 1;
}

function extractMethods(block: string, className: string): { methods: string[]; constructorExists: boolean } {
  const methods: string[] = [];
  let constructorExists = false;

  for (const name of captureAll(METHOD_REGEX, block)) {
    if (name === className) {
      constructorExists = true;
      continue;
    }
    methods.push(name);
  }

  if (new RegExp(`\\b${className}\\s*\\(`).test(block)) {
    constructorExists = true;
  }

  return { methods: Array.from(new Set(methods)), constructorExists };
}

export async function parseDartFile(filePath: string): Promise<SimpleFileInfo> {
  const content = await readFileContent(filePath);
  if (!content) {
    return {
      filePath,
      classes: [],
      functions: [],
      imports: [],
      lineCount: 0,
      dependencies: [],
    };
  }

  const lineCount = countLines(content);
  const imports = extractImports(content);
  const classes: SimpleClassInfo[] = [];
  const classRanges: Array<{ start: number; end: number }> = [];

  for (const classMatch of content.matchAll(CLASS_REGEX)) {
    const className = classMatch[2];
    const braceIndex = content.indexOf('{', classMatch.index);
    if (braceIndex === -1) continue;

    const endIndex = findBlockEnd(content, braceIndex);
    const block = content.slice(braceIndex + 1, endIndex);
    const classText = content.slice(classMatch.index, endIndex + 1);

    const { methods, constructorExists } = extractMethods(block, className);

    classes.push({
      name: className,
      filePath,
      lineCount: countLines(classText),
      methodCount: methods.length,
      propertyCount: 0,
      importCount: imports.length,
      constructorExists,
      methods,
      dependencies: imports,
    });

    classRanges.push({ start: classMatch.index, end: endIndex });
  }

  const functions: SimpleFunctionInfo[] = [];
  for (const functionMatch of content.matchAll(FUNCTION_REGEX)) {
    const startIndex = functionMatch.index;
    if (classRanges.some((r) => startIndex >= r.start && startIndex <= r.end)) {
      continue;
    }

    const name = functionMatch[1];
    if (!name || NON_FUNCTION_KEYWORDS.has(name)) {
      continue;
    }

    const paramsText = functionMatch[2] || '';
    const paramCount = paramsText
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0).length;

    functions.push({
      name,
      lineCount: 0,
      paramCount,
    });
  }

  return {
    filePath,
    classes,
    functions,
    imports,
    lineCount,
    dependencies: imports,
  };
}

export async function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  const results: SimpleFileInfo[] = [];

  for (const file of files) {
    try {
      const info = await parseDartFile(file);
      results.push(info);
    } catch (error) {
      console.warn(`Warning: Failed to analyze Dart file ${path.basename(file)}:`, error);
    }
  }

  return results;
}
