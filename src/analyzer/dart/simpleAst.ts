import path from 'path';
import { readFileContent } from '../../fileWalker';
import { DartClassInfo, DartFileInfo, DartFunctionInfo } from '../../types';

function countLines(content: string): number {
  return content.split('\n').length;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const importRegex = /^\s*(import|export|part)\s+['"]([^'"]+)['"]/gm;
  let match: RegExpExecArray | null = null;

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[2]);
  }

  return Array.from(new Set(imports));
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

  const methodRegex = /(?:^|\n)\s*(?:@[A-Za-z0-9_().,\s]+)?\s*(?:static\s+)?(?:[A-Za-z_<>{}\[\]?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null = null;

  while ((match = methodRegex.exec(block)) !== null) {
    const name = match[1];
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

export async function parseDartFile(filePath: string): Promise<DartFileInfo> {
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
  const classes: DartClassInfo[] = [];
  const classRanges: Array<{ start: number; end: number }> = [];

  const classRegex = /\b(class|mixin|extension|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let classMatch: RegExpExecArray | null = null;

  while ((classMatch = classRegex.exec(content)) !== null) {
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

  const functions: DartFunctionInfo[] = [];
  const functionRegex = /(?:^|\n)\s*(?:@[A-Za-z0-9_().,\s]+)?\s*(?:[A-Za-z_<>{}\[\]?]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*(?:async\s*)?(?:=>|\{)/g;
  let functionMatch: RegExpExecArray | null = null;

  while ((functionMatch = functionRegex.exec(content)) !== null) {
    const startIndex = functionMatch.index;
    if (classRanges.some((r) => startIndex >= r.start && startIndex <= r.end)) {
      continue;
    }

    const name = functionMatch[1];
    if (!name || ['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(name)) {
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

export async function analyzeDirectory(files: string[]): Promise<DartFileInfo[]> {
  const results: DartFileInfo[] = [];

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
