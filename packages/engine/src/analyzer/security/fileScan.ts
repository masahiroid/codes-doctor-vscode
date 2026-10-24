import { SecurityIssue } from '../../types';
import type { SecurityLanguage } from '../languages/catalog';
import { SECURITY_PATTERNS } from './patterns';
import { securityIgnoredRanges } from './ignoredRanges';
import { securityEvidence, SecurityEvidence } from './syntaxEvidence';
import { isTestPath } from './testCode';
import { flowIssues, reconcilePatternIssue } from './flowFindings';
import { analyzeFlows, DataFlow, flowGrammarFor } from '../flow/taint';
import { SYNTAX_SPECS, LanguageSyntaxSpec } from '../syntax';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Detecting security findings in source files: rule patterns, minus matches in text, comments
 * and constant-only calls, reconciled with data-flow analysis. Scoring them is securityScore's job.
 */

/** Categories whose patterns match a call; a call made only with literal arguments is not reported. */
const CALL_CATEGORIES = new Set(['Command Injection']);

/**
 * Scan a batch of files (one language) for security issues, in file order; within a file, traced
 * flows come before pattern findings. Findings in test code are marked `inTest`.
 * `fileInfo.filePath` is already absolute (fileWalker returns absolute paths),
 * so it's used as-is rather than re-joined with repoPath — path.join would silently
 * produce a non-existent path if given an absolute second argument, making every
 * file in the batch fail to read and be skipped without surfacing an error.
 */
export async function scanSecurityIssues(
  files: ReadonlyArray<{ filePath: string }>,
  repoPath: string,
  language: SecurityLanguage
): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  for (const fileInfo of files) {
    const fullPath = path.isAbsolute(fileInfo.filePath)
      ? fileInfo.filePath
      : path.join(repoPath, fileInfo.filePath);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue; // Skip files that can't be read
    }
    const inTest = isTestPath(path.relative(repoPath, fullPath));
    issues.push(...(await scanFileForIssues(content, fileInfo.filePath, language)).map((issue) => ({ ...issue, inTest })));
  }
  return issues;
}

/** Syntax facts that rule matches out: literal/comment text, and calls made only with constants. */
async function evidenceFor(content: string, language: SecurityLanguage): Promise<SecurityEvidence> {
  if (language === 'typescript') return { textRanges: securityIgnoredRanges(content), literalCallParens: new Set() };
  const spec = (SYNTAX_SPECS as Partial<Record<SecurityLanguage, LanguageSyntaxSpec>>)[language];
  if (!spec) return { textRanges: [], literalCallParens: new Set() };
  try {
    return await securityEvidence(spec, content);
  } catch {
    return { textRanges: [], literalCallParens: new Set() };
  }
}

/**
 * Scan a single file for security issues
 */
async function scanFileForIssues(
  content: string,
  filePath: string,
  language: SecurityLanguage
): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  const patterns = SECURITY_PATTERNS[language];
  const lines = content.split('\n');
  const evidence = await evidenceFor(content, language);
  const flows = await flowsFor(content, language, filePath);
  // TypeScript ranges come from the compiler: a match starting inside one is text. Tree-sitter
  // ranges must contain the whole match, so patterns spanning a string boundary still count.
  const isText = (start: number, end: number) => language === 'typescript'
    ? evidence.textRanges.some(([from, to]) => start >= from && start < to)
    : evidence.textRanges.some(([from, to]) => start >= from && end <= to);

  for (const patternDef of patterns) {
    const matches = content.matchAll(patternDef.pattern);

    for (const match of matches) {
      if (isText(match.index, match.index + match[0].length)) continue;
      if (CALL_CATEGORIES.has(patternDef.category) && evidence.literalCallParens.has(match.index + match[0].lastIndexOf('('))) continue;
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Skip if it's in a comment
      const lineContent = lines[lineNumber - 1];
      if (isInComment(lineContent, language)) {
        continue;
      }

      const finding: SecurityIssue = {
        type: patternDef.type,
        category: patternDef.category,
        description: patternDef.description,
        filePath,
        lineNumber,
        recommendation: patternDef.recommendation,
      };
      // Without flow analysis (unsupported language or a parse failure) the pattern stands as is.
      const issue = flows === null ? finding : reconcilePatternIssue(finding, flows);
      if (issue) issues.push(issue);
    }
  }

  return [...flowIssues(flows ?? [], filePath), ...issues];
}

/** Data flows from untrusted input to dangerous calls, or null when flows are not analyzed. */
async function flowsFor(content: string, language: SecurityLanguage, filePath: string): Promise<DataFlow[] | null> {
  const grammar = flowGrammarFor(language, filePath);
  if (!grammar) return null;
  try {
    return await analyzeFlows(grammar, content);
  } catch {
    return null;
  }
}

/**
 * Check if a line is a comment
 */
function isInComment(line: string, language: SecurityLanguage): boolean {
  const trimmed = line.trim();

  if (language === 'typescript') {
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }
  if (language === 'python') {
    return trimmed.startsWith('#');
  }
  return trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*');
}
