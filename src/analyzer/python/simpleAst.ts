import path from 'path';
import { readFileContent } from '../../fileWalker';
import { PythonClassInfo, PythonFileInfo, PythonFunctionInfo } from '../../types';

interface LogicalLine {
  /** Indentation width in columns (tabs expanded to TAB_WIDTH spaces) */
  indent: number;
  /** Line content with leading whitespace and trailing comment stripped */
  text: string;
  /** 0-based index into the original line array, for line-count bookkeeping */
  lineIndex: number;
}

const TAB_WIDTH = 8;

function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Strip a line's indentation (expanding tabs) and any `#` comment.
 * Does not attempt to handle `#` inside strings — acceptable for a
 * lightweight structural scan, same tradeoff as the Dart regex parser.
 */
function toLogicalLine(rawLine: string, lineIndex: number): LogicalLine | null {
  const withoutComment = stripComment(rawLine);
  if (!withoutComment.trim()) return null;

  let indent = 0;
  let i = 0;
  while (i < withoutComment.length) {
    const ch = withoutComment[i];
    if (ch === ' ') indent += 1;
    else if (ch === '\t') indent += TAB_WIDTH;
    else break;
    i += 1;
  }

  return { indent, text: withoutComment.slice(i).trimEnd(), lineIndex };
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

function toLogicalLines(content: string): LogicalLine[] {
  return content
    .split('\n')
    .map((line, idx) => toLogicalLine(line, idx))
    .filter((l): l is LogicalLine => l !== null);
}

function extractImports(logicalLines: LogicalLine[]): string[] {
  const imports: string[] = [];
  const importRegex = /^import\s+([A-Za-z0-9_.]+)/;
  const fromImportRegex = /^from\s+([A-Za-z0-9_.]+)\s+import\b/;

  for (const line of logicalLines) {
    const importMatch = line.text.match(importRegex);
    if (importMatch) {
      imports.push(importMatch[1]);
      continue;
    }
    const fromMatch = line.text.match(fromImportRegex);
    if (fromMatch) {
      imports.push(fromMatch[1]);
    }
  }

  return Array.from(new Set(imports));
}

/**
 * Find the end of an indented block starting right after `headerIndex`.
 * The block ends at the first subsequent line whose indent is <= the
 * header's own indent (i.e. back at or above the header's level).
 */
function findBlockEnd(logicalLines: LogicalLine[], headerIndex: number, headerIndent: number): number {
  for (let i = headerIndex + 1; i < logicalLines.length; i += 1) {
    if (logicalLines[i].indent <= headerIndent) {
      return i - 1;
    }
  }
  return logicalLines.length - 1;
}

function countParams(paramsText: string): number {
  const params = paramsText
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== 'self' && p !== 'cls');
  return params.length;
}

const CLASS_HEADER_REGEX = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/;
const DEF_HEADER_REGEX = /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;

export async function parsePythonFile(filePath: string): Promise<PythonFileInfo> {
  const content = await readFileContent(filePath);
  if (!content) {
    return { filePath, classes: [], functions: [], imports: [], lineCount: 0, dependencies: [] };
  }

  const lineCount = countLines(content);
  const logicalLines = toLogicalLines(content);
  const imports = extractImports(logicalLines);

  const classes: PythonClassInfo[] = [];
  const classRanges: Array<{ start: number; end: number }> = [];

  for (let i = 0; i < logicalLines.length; i += 1) {
    const line = logicalLines[i];
    const classMatch = line.text.match(CLASS_HEADER_REGEX);
    if (!classMatch) continue;

    const className = classMatch[1];
    const blockEnd = findBlockEnd(logicalLines, i, line.indent);
    const bodyLines = logicalLines.slice(i + 1, blockEnd + 1).filter((l) => l.indent > line.indent);

    const methods: string[] = [];
    let constructorExists = false;
    for (const bodyLine of bodyLines) {
      const defMatch = bodyLine.text.match(DEF_HEADER_REGEX);
      if (!defMatch) continue;
      const methodName = defMatch[1];
      if (methodName === '__init__') {
        constructorExists = true;
        continue;
      }
      methods.push(methodName);
    }

    const startLineIndex = line.lineIndex;
    const endLineIndex = blockEnd >= i ? logicalLines[blockEnd].lineIndex : startLineIndex;

    classes.push({
      name: className,
      filePath,
      lineCount: endLineIndex - startLineIndex + 1,
      methodCount: methods.length,
      propertyCount: 0,
      importCount: imports.length,
      constructorExists,
      methods: Array.from(new Set(methods)),
      dependencies: imports,
    });

    classRanges.push({ start: i, end: blockEnd });
  }

  const functions: PythonFunctionInfo[] = [];
  for (let i = 0; i < logicalLines.length; i += 1) {
    if (classRanges.some((r) => i > r.start && i <= r.end)) continue;

    const line = logicalLines[i];
    const defMatch = line.text.match(DEF_HEADER_REGEX);
    if (!defMatch) continue;

    functions.push({
      name: defMatch[1],
      lineCount: 0,
      paramCount: countParams(defMatch[2] || ''),
    });
  }

  return { filePath, classes, functions, imports, lineCount, dependencies: imports };
}

export async function analyzeDirectory(files: string[]): Promise<PythonFileInfo[]> {
  const results: PythonFileInfo[] = [];

  for (const file of files) {
    try {
      const info = await parsePythonFile(file);
      results.push(info);
    } catch (error) {
      console.warn(`Warning: Failed to analyze Python file ${path.basename(file)}:`, error);
    }
  }

  return results;
}
