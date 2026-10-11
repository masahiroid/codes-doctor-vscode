/**
 * Text-level helpers shared by the lightweight (regex-based) language parsers.
 * They operate on raw source strings and know nothing about any one language;
 * language differences are passed in as options.
 */

const LINE_COMMENT = '//';
const BLOCK_COMMENT_OPEN = '/*';
const BLOCK_COMMENT_CLOSE = '*/';
const ESCAPE = '\\';
const NEWLINE = '\n';
const PARAM_SEPARATOR = ',';
const DEFAULT_STRING_DELIMITERS: readonly string[] = ['"', "'"];
const DEFAULT_NESTING_PAIRS: ReadonlyArray<readonly [string, string]> = [['(', ')'], ['[', ']'], ['<', '>']];

export function countLines(content: string): number {
  return content.split(NEWLINE).length;
}

export interface StripCommentsOptions {
  /** Characters that open and close a string literal. */
  stringDelimiters?: readonly string[];
  /** Delimiters whose strings are raw (no backslash escapes), e.g. Go's backtick strings. */
  rawStringDelimiters?: readonly string[];
}

/**
 * Remove `//` and `/* *\/` comments while leaving string literals intact, so braces and
 * keywords inside comments don't confuse the structural scan. Newlines inside line
 * comments are kept so line numbers stay stable.
 */
export function stripComments(content: string, options: StripCommentsOptions = {}): string {
  const delimiters = options.stringDelimiters ?? DEFAULT_STRING_DELIMITERS;
  const rawDelimiters = options.rawStringDelimiters ?? [];
  let out = '';
  let inLineComment = false;
  let inBlockComment = false;
  let inString: string | null = null;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const pair = ch + (content[i + 1] ?? '');

    if (inLineComment) {
      if (ch === NEWLINE) {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (pair === BLOCK_COMMENT_CLOSE) {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === ESCAPE && !rawDelimiters.includes(inString)) {
        out += content[i + 1];
        i += 1;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (delimiters.includes(ch)) {
      inString = ch;
      out += ch;
      continue;
    }
    if (pair === LINE_COMMENT) {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (pair === BLOCK_COMMENT_OPEN) {
      inBlockComment = true;
      i += 1;
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Find the `{` at or after `fromIndex` and its matching `}`.
 * Returns [openIndex, closeIndex], or null when there is no `{` or it is never closed.
 */
export function findBraceBlock(content: string, fromIndex: number): [number, number] | null {
  const openIndex = content.indexOf('{', fromIndex);
  if (openIndex === -1) return null;

  let depth = 0;
  for (let i = openIndex; i < content.length; i += 1) {
    if (content[i] === '{') depth += 1;
    else if (content[i] === '}') {
      depth -= 1;
      if (depth === 0) return [openIndex, i];
    }
  }
  return null;
}

/** Zero-based line number of a character offset. */
export function offsetToLine(content: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < content.length; i += 1) {
    if (content[i] === NEWLINE) line += 1;
  }
  return line;
}

export interface CountParamsOptions {
  /** Bracket pairs whose commas are nested and therefore don't separate parameters. */
  nestingPairs?: ReadonlyArray<readonly [string, string]>;
  /** Return true for parameters that should not be counted (e.g. a `self` receiver). */
  isExcluded?: (param: string) => boolean;
}

/** Count parameters in a raw parameter list, splitting only on top-level commas. */
export function countTopLevelParams(paramsText: string, options: CountParamsOptions = {}): number {
  const trimmed = paramsText.trim();
  if (!trimmed) return 0;

  const pairs = options.nestingPairs ?? DEFAULT_NESTING_PAIRS;
  const openers = new Set(pairs.map(([open]) => open));
  const closers = new Set(pairs.map(([, close]) => close));
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of trimmed) {
    if (openers.has(ch)) depth += 1;
    else if (closers.has(ch)) depth -= 1;
    if (ch === PARAM_SEPARATOR && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  return parts.filter((p) => p.trim().length > 0 && !options.isExcluded?.(p.trim())).length;
}

/** Collect one capture group from every match of a global regex. */
export function captureAll(pattern: RegExp, text: string, group = 1): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[group]);
}

/** De-duplicate while keeping first-seen order. */
export function unique<T>(values: Iterable<T>): T[] {
  return Array.from(new Set(values));
}
