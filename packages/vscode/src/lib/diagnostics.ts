import path from 'node:path';
import type { AnalysisResult } from './engine';

export function resolveIssueFilePath(repoPath: string, filePath: string): string {
  if (!filePath) return repoPath;
  return path.isAbsolute(filePath) ? filePath : path.resolve(repoPath, filePath);
}

export function updateDiagnostics(
  vscode: typeof import('vscode'),
  collection: import('vscode').DiagnosticCollection | undefined,
  result: AnalysisResult | null | undefined
) {
  if (!collection) return;
  collection.clear();
  if (!result) return;

  const byFile = new Map<string, import('vscode').Diagnostic[]>();
  const addDiag = (absPath: string, diag: import('vscode').Diagnostic) => {
    const list = byFile.get(absPath) || [];
    list.push(diag);
    byFile.set(absPath, list);
  };

  const issues = result.securityScore?.issues || [];
  for (const issue of issues) {
    if (issue.type === 'info') continue;
    const absPath = resolveIssueFilePath(result.repoPath, issue.filePath);
    const lineIdx = issue.lineNumber && issue.lineNumber > 0 ? issue.lineNumber - 1 : 0;
    const range = new vscode.Range(lineIdx, 0, lineIdx, 200);

    let severity: import('vscode').DiagnosticSeverity;
    if (issue.inTest) {
      severity = vscode.DiagnosticSeverity.Information;
    } else if (issue.type === 'critical' || issue.type === 'high') {
      severity = vscode.DiagnosticSeverity.Error;
    } else if (issue.type === 'medium') {
      severity = vscode.DiagnosticSeverity.Warning;
    } else {
      severity = vscode.DiagnosticSeverity.Information;
    }

    const badge = issue.inTest
      ? '[Test code] '
      : issue.confidence === 'flow'
        ? '[Input reaches] '
        : '';
    const message = `${badge}[${issue.category}] ${issue.description} — ${issue.recommendation}`;
    const diag = new vscode.Diagnostic(range, message, severity);
    diag.source = 'Codes Doctor';
    diag.code = issue.category;

    if (issue.flow && vscode.DiagnosticRelatedInformation && vscode.Location && vscode.Uri) {
      const uri = vscode.Uri.file(absPath);
      const related: import('vscode').DiagnosticRelatedInformation[] = [];
      const addFlowStep = (line: number, label: string, code: string) => {
        const idx = line > 0 ? line - 1 : 0;
        const stepRange = new vscode.Range(idx, 0, idx, 200);
        related.push(new vscode.DiagnosticRelatedInformation(new vscode.Location(uri, stepRange), `${label}: ${code.trim()}`));
      };
      addFlowStep(issue.flow.source.line, 'Input source', issue.flow.source.code);
      for (const step of issue.flow.steps || []) {
        addFlowStep(step.line, 'Via', step.code);
      }
      addFlowStep(issue.flow.sink.line, 'Reaches sink', issue.flow.sink.code);
      diag.relatedInformation = related;
    }

    addDiag(absPath, diag);
  }

  const godClasses = result.godClasses || [];
  for (const gc of godClasses) {
    if (gc.rank !== 'critical' && gc.rank !== 'high') continue;
    const absPath = resolveIssueFilePath(result.repoPath, gc.filePath);
    const range = new vscode.Range(0, 0, 0, 200);
    const severity =
      gc.rank === 'critical' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
    const warnings = (gc.warnings || []).join('; ');
    const message = `[God Class: ${gc.className}] Score ${gc.godScore} (${gc.rank.toUpperCase()}) — ${gc.lineCount} lines, ${gc.methodCount} methods.${warnings ? ` ${warnings}` : ''}`;
    const diag = new vscode.Diagnostic(range, message, severity);
    diag.source = 'Codes Doctor';
    diag.code = 'God Class';
    addDiag(absPath, diag);
  }

  for (const [absPath, diags] of byFile.entries()) {
    collection.set(vscode.Uri.file(absPath), diags);
  }
}

module.exports = {
  resolveIssueFilePath,
  updateDiagnostics,
};

