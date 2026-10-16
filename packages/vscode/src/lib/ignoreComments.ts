import fs from 'node:fs';
import { resolveIssueFilePath } from './diagnostics';
import { translator } from './i18n';
import type { AnalysisResult } from './engine';

export interface FileIgnoreRules {
  ignoreFile: boolean;
  /** Map of 1-based line number -> set of ignored categories (or '*' for all) */
  ignoredLines: Map<number, Set<string>>;
}

const IGNORE_FILE_RE = /(?:\/\/|#|\/\*+|\*)\s*code-doctor-(?:ignore|disable)-file\b/i;
const IGNORE_NEXT_LINE_RE = /(?:\/\/|#|\/\*+)\s*code-doctor-(?:ignore|disable)-next-line(?:\s+([^\r\n*]+))?/i;
const IGNORE_LINE_RE = /(?:\/\/|#|\/\*+)\s*code-doctor-(?:ignore|disable)(?:-line)?(?:\s+([^\r\n*]+))?$/i;

function addRule(map: Map<number, Set<string>>, lineOneBased: number, rawCategories?: string) {
  const set = map.get(lineOneBased) || new Set<string>();
  const trimmed = (rawCategories || '').replace(/\*+\/\s*$/, '').trim();
  if (!trimmed) {
    set.add('*');
  } else {
    for (const part of trimmed.split(',')) {
      const cat = part.trim().toLowerCase();
      if (cat) set.add(cat);
    }
  }
  map.set(lineOneBased, set);
}

export function parseIgnoreComments(content: string): FileIgnoreRules {
  const ignoredLines = new Map<number, Set<string>>();
  if (!content) return { ignoreFile: false, ignoredLines };

  if (IGNORE_FILE_RE.test(content)) {
    return { ignoreFile: true, ignoredLines };
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    const nextMatch = IGNORE_NEXT_LINE_RE.exec(line);
    if (nextMatch) {
      addRule(ignoredLines, lineNum + 1, nextMatch[1]);
      continue;
    }

    const sameMatch = IGNORE_LINE_RE.exec(line);
    if (sameMatch && !/code-doctor-(?:ignore|disable)-(?:next-line|file)/i.test(line)) {
      addRule(ignoredLines, lineNum, sameMatch[1]);
    }
  }

  return { ignoreFile: false, ignoredLines };
}

export function isIssueIgnored(rules: FileIgnoreRules, lineOneBased?: number, category?: string): boolean {
  if (rules.ignoreFile) return true;
  if (!lineOneBased) return false;
  const set = rules.ignoredLines.get(lineOneBased);
  if (!set) return false;
  if (set.has('*')) return true;
  if (category && set.has(category.toLowerCase())) return true;
  return false;
}

/**
 * Filter out security issues and God Classes suppressed by inline ignore comments.
 */
export function applyIgnoreComments(result: AnalysisResult, fileContentMap?: ReadonlyMap<string, string>): AnalysisResult {
  const rulesCache = new Map<string, FileIgnoreRules>();

  const getRules = (absPath: string): FileIgnoreRules => {
    const cached = rulesCache.get(absPath);
    if (cached) return cached;
    let content = fileContentMap?.get(absPath);
    if (content === undefined) {
      try {
        content = fs.readFileSync(absPath, 'utf8');
      } catch {
        content = '';
      }
    }
    const parsed = parseIgnoreComments(content);
    rulesCache.set(absPath, parsed);
    return parsed;
  };

  let securityScore = result.securityScore;
  if (securityScore && Array.isArray(securityScore.issues)) {
    const filteredIssues = securityScore.issues.filter((issue) => {
      if (issue.type === 'info') return true;
      const absPath = resolveIssueFilePath(result.repoPath, issue.filePath);
      const rules = getRules(absPath);
      return !isIssueIgnored(rules, issue.lineNumber, issue.category);
    });

    const prod = filteredIssues.filter((i) => !i.inTest);
    const summary = {
      critical: prod.filter((i) => i.type === 'critical').length,
      high: prod.filter((i) => i.type === 'high').length,
      medium: prod.filter((i) => i.type === 'medium').length,
      low: prod.filter((i) => i.type === 'low').length,
      info: prod.filter((i) => i.type === 'info').length,
    };
    securityScore = {
      ...securityScore,
      issues: filteredIssues,
      summary,
    };
  }

  const godClasses = (result.godClasses || []).filter((gc) => {
    const absPath = resolveIssueFilePath(result.repoPath, gc.filePath);
    const rules = getRules(absPath);
    return !rules.ignoreFile && !isIssueIgnored(rules, 1, 'god class');
  });

  return {
    ...result,
    securityScore,
    godClasses,
  };
}

export function createIgnoreCodeActionProvider(vscode: typeof import('vscode')): import('vscode').CodeActionProvider {
  return {
    provideCodeActions(document, _range, context) {
      if (!context?.diagnostics) return [];
      const t = translator(vscode);
      const actions: import('vscode').CodeAction[] = [];

      for (const diag of context.diagnostics) {
        if (diag.source !== 'Codes Doctor') continue;
        const lineIdx = diag.range.start.line;
        const lineText = document.lineAt ? document.lineAt(lineIdx).text : '';
        const indentMatch = /^(\s*)/.exec(lineText);
        const indent = indentMatch ? indentMatch[1] : '';
        const codeStr = typeof diag.code === 'string' ? diag.code : '';

        if (codeStr === 'God Class') {
          const action = new vscode.CodeAction(
            t('Codes Doctor: Ignore God Class in this file'),
            vscode.CodeActionKind?.QuickFix
          );
          const edit = new vscode.WorkspaceEdit();
          edit.insert(document.uri, new vscode.Position(0, 0), `// code-doctor-ignore-file\n`);
          action.edit = edit;
          action.diagnostics = [diag];
          actions.push(action);
        } else {
          const comment = codeStr
            ? `${indent}// code-doctor-ignore-next-line ${codeStr}\n`
            : `${indent}// code-doctor-ignore-next-line\n`;
          const action = new vscode.CodeAction(
            t('Codes Doctor: Ignore on this line ({category})', { category: codeStr || 'issue' }),
            vscode.CodeActionKind?.QuickFix
          );
          const edit = new vscode.WorkspaceEdit();
          edit.insert(document.uri, new vscode.Position(lineIdx, 0), comment);
          action.edit = edit;
          action.diagnostics = [diag];
          actions.push(action);
        }
      }

      return actions;
    },
  };
}

module.exports = {
  parseIgnoreComments,
  isIssueIgnored,
  applyIgnoreComments,
  createIgnoreCodeActionProvider,
};

