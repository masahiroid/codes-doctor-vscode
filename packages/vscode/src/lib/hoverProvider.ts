import path from 'node:path';
import { getLastAnalysis } from './lastAnalysisState';
import { resolveIssueFilePath } from './diagnostics';
import { translator } from './i18n';

export function buildHoverMarkdown(
  vscode: typeof import('vscode'),
  filePath: string,
  lineOneBased: number,
  result: import('./engine').AnalysisResult | null | undefined
): string[] {
  if (!result) return [];
  const t = translator(vscode);
  const targetPath = path.resolve(filePath);
  const blocks: string[] = [];

  const issues = result.securityScore?.issues || [];
  for (const issue of issues) {
    if (issue.type === 'info') continue;
    const issuePath = resolveIssueFilePath(result.repoPath, issue.filePath);
    if (path.resolve(issuePath) !== targetPath) continue;

    const matchesLine =
      issue.lineNumber === lineOneBased ||
      (issue.flow &&
        (issue.flow.source.line === lineOneBased ||
          issue.flow.sink.line === lineOneBased ||
          (issue.flow.steps || []).some((s) => s.line === lineOneBased)));

    if (!matchesLine) continue;

    const lines: string[] = [];
    const severityBadge = issue.type.toUpperCase();
    const confidenceLabel =
      issue.confidence === 'flow'
        ? ` — ${t('Input reaches')}`
        : issue.confidence === 'pattern'
          ? ` — ${t('Needs review')}`
          : '';
    lines.push(`### 🛡️ Codes Doctor: ${issue.category} (${severityBadge}${confidenceLabel})`);
    lines.push('');
    lines.push(issue.description);
    lines.push('');
    lines.push(`**${t('Recommendation')}:** ${issue.recommendation}`);

    if (issue.flow) {
      lines.push('');
      lines.push(`**${t('Traced Data Flow')}:**`);
      lines.push(`- **${t('Source')} (L${issue.flow.source.line}):** \`${issue.flow.source.code.trim()}\``);
      for (const step of issue.flow.steps || []) {
        lines.push(`- **${t('Via')} (L${step.line}):** \`${step.code.trim()}\``);
      }
      lines.push(`- **${t('Sink')} (L${issue.flow.sink.line}):** \`${issue.flow.sink.code.trim()}\``);
    }

    blocks.push(lines.join('\n'));
  }

  if (lineOneBased === 1) {
    const godClasses = result.godClasses || [];
    for (const gc of godClasses) {
      if (gc.rank !== 'critical' && gc.rank !== 'high') continue;
      const gcPath = resolveIssueFilePath(result.repoPath, gc.filePath);
      if (path.resolve(gcPath) !== targetPath) continue;

      const lines: string[] = [];
      lines.push(`### 🏛️ Codes Doctor: God Class — \`${gc.className}\` (${gc.rank.toUpperCase()})`);
      lines.push('');
      lines.push(
        `- **Score:** ${gc.godScore} | **Lines:** ${gc.lineCount} | **Methods:** ${gc.methodCount} | **Properties:** ${gc.propertyCount} | **Imports:** ${gc.importCount}`
      );
      if (gc.warnings && gc.warnings.length > 0) {
        lines.push(`- **${t('Warnings')}:** ${gc.warnings.join('; ')}`);
      }
      blocks.push(lines.join('\n'));
    }
  }

  return blocks;
}

export function createHoverProvider(vscode: typeof import('vscode')): import('vscode').HoverProvider {
  return {
    provideHover(document, position) {
      if (!document?.uri?.fsPath) return null;
      const last = getLastAnalysis();
      if (!last?.result) return null;

      const blocks = buildHoverMarkdown(vscode, document.uri.fsPath, position.line + 1, last.result);
      if (blocks.length === 0) return null;

      const md = new vscode.MarkdownString(blocks.join('\n\n---\n\n'));
      md.isTrusted = false;
      return new vscode.Hover(md);
    },
  };
}

module.exports = {
  buildHoverMarkdown,
  createHoverProvider,
};

