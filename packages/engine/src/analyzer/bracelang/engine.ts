import path from 'path';
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
 * Shared lightweight structural parser for brace-delimited languages whose methods
 * live inside the type body (Swift, C#, Java, Kotlin, C++). Each language supplies a
 * `BraceLanguageConfig` with its syntax as regexes; this module does the rest.
 */
export interface BraceLanguageConfig {
  /** Human-readable language name, used only in warning logs. */
  languageName: string;
  /** Global regex matching a type declaration header; group 1 is the type name. */
  typeHeaderRegex: RegExp;
  /**
   * Global regex matching a method/function header; group 1 is the name and group 2
   * the raw parameter list. It must not match non-method constructs inside bodies
   * (e.g. C#'s auto-property `{ get; set; }`).
   */
  methodHeaderRegex: RegExp;
  /** Global multiline regex matching an import/use statement; group 1 is the target. */
  importRegex: RegExp;
  /** Optional global multiline regex matching a field/property declaration. */
  propertyRegex?: RegExp;
  /**
   * Whether a constructor exists, given the type body, its name, and its header text
   * (Kotlin declares primary constructors in the header rather than the body).
   */
  hasConstructor: (body: string, typeName: string, headerText: string) => boolean;
}

const EMPTY_FILE: Omit<SimpleFileInfo, 'filePath'> = { classes: [], functions: [], imports: [], lineCount: 0, dependencies: [] };

export async function parseBraceLanguageFile(filePath: string, config: BraceLanguageConfig): Promise<SimpleFileInfo> {
  const rawContent = await readFileContent(filePath);
  if (!rawContent) return { filePath, ...EMPTY_FILE };

  const content = stripComments(rawContent);
  const imports = unique(captureAll(config.importRegex, content));
  const classes: SimpleClassInfo[] = [];
  const typeRanges: Array<{ start: number; end: number }> = [];

  for (const match of content.matchAll(config.typeHeaderRegex)) {
    const name = match[1];
    const block = findBraceBlock(content, match.index + match[0].length);
    if (!block) continue;
    const [open, close] = block;
    const body = content.slice(open + 1, close);
    const methods = captureAll(config.methodHeaderRegex, body);

    classes.push({
      name,
      filePath,
      lineCount: offsetToLine(content, close) - offsetToLine(content, match.index) + 1,
      methodCount: methods.length,
      propertyCount: config.propertyRegex ? (body.match(config.propertyRegex) ?? []).length : 0,
      importCount: imports.length,
      constructorExists: config.hasConstructor(body, name, content.slice(match.index, open)),
      methods: unique(methods),
      dependencies: imports,
    });
    typeRanges.push({ start: open, end: close });
  }

  const functions: SimpleFunctionInfo[] = [];
  for (const match of content.matchAll(config.methodHeaderRegex)) {
    if (typeRanges.some((r) => match.index > r.start && match.index < r.end)) continue;
    functions.push({ name: match[1], lineCount: 0, paramCount: countTopLevelParams(match[2] ?? '') });
  }

  return { filePath, classes, functions, imports, lineCount: countLines(rawContent), dependencies: imports };
}

export async function analyzeBraceLanguageDirectory(files: string[], config: BraceLanguageConfig): Promise<SimpleFileInfo[]> {
  const results: SimpleFileInfo[] = [];
  for (const file of files) {
    try {
      results.push(await parseBraceLanguageFile(file, config));
    } catch (error) {
      console.warn(`Warning: Failed to analyze ${config.languageName} file ${path.basename(file)}:`, error);
    }
  }
  return results;
}
