import path from 'node:path';
import type { Candidate, CompiledRule, FlowLine } from './scan';

type Translate = (message: string, values?: Record<string, unknown>) => string;

export const DIAGNOSTIC_SOURCE = 'Codes Doctor Security Rules';

/** Escape Markdown syntax in rule text that came from the network. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()<>#+!|~&-]/g, '\\$&');
}

/** `L12` for a line of the scanned file, `users.ts:L12` for a line of another file. */
const where = (line: FlowLine) => (line.file ? `${path.basename(line.file)}:L${line.line}` : `L${line.line}`);

/** A Problems entry for one candidate; a data flow links its source and the lines it passed through. */
export function buildDiagnostic(vscode: typeof import('vscode'), t: Translate, entry: CompiledRule | undefined, candidate: Candidate, uri?: import('vscode').Uri) {
  const severity = entry?.rule.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
  const range = new vscode.Range(candidate.startLine, candidate.startColumn, candidate.endLine, candidate.endColumn);
  const flow = candidate.flow;
  const access = entry?.taint?.kind === 'access';
  const message = flow && access
    ? `[${candidate.ruleId}] ${t('No ownership check')}: ${entry?.rule.title ?? candidate.ruleId} — ${t('the ID from line {line} selects the object here without a check that it belongs to the signed-in user', { line: flow.source.line })}`
    : flow
    ? `[${candidate.ruleId}] ${t('Input reaches')}: ${entry?.rule.title ?? candidate.ruleId} — ${flow.sink.file
      ? t('input from line {line} is passed to {target}', { line: flow.source.line, target: where(flow.sink) })
      : t('input from line {line} reaches this call', { line: flow.source.line })}`
    : `[${candidate.ruleId}] ${t('Review required')}: ${entry?.rule.title ?? candidate.ruleId} — ${entry?.rule.message ?? ''}`;
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = candidate.ruleId;
  if (flow && uri) {
    const at = (line: FlowLine) => new vscode.Location(line.file ? vscode.Uri.file(line.file) : uri, new vscode.Range(Math.max(line.line - 1, 0), 0, Math.max(line.line - 1, 0), 200));
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(at(flow.source), `${t('Source')}: ${flow.source.code}`),
      ...flow.steps.map((step) => new vscode.DiagnosticRelatedInformation(at(step), `${t('Via')}: ${step.code}`)),
      ...(flow.sink.file ? [new vscode.DiagnosticRelatedInformation(at(flow.sink), `${t('Sink')}: ${flow.sink.code}`)] : []),
    ];
  }
  return diagnostic;
}

/** Hover text for one candidate: the rule, its source documents and check steps, and the traced path. */
export function buildHoverMarkdown(t: Translate, entry: CompiledRule | undefined, candidate: Candidate): string | undefined {
  if (!entry) return undefined;
  const { pack, rule } = entry;
  // Rule text comes from the network, so it is escaped before it is rendered as Markdown.
  const lines = [
    `### 🛡️ ${escapeMarkdown(rule.id)}: ${escapeMarkdown(rule.title)}`,
    '',
    escapeMarkdown(rule.message),
    '',
    `**${t('Pack')}:** ${escapeMarkdown(`${pack.id} ${pack.version} (${pack.channel})`)}`,
    `**${t('Category')}:** ${escapeMarkdown(rule.category)}`,
    `**${t('Management sheet column')}:** ${escapeMarkdown(rule.excelColumn)} → ${escapeMarkdown(rule.actionRequired)}`,
  ];
  if (candidate.flow) {
    const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;
    const flow = candidate.flow;
    lines.push('', `**${t('Traced Data Flow')}:**`, `- **${t('Source')} (${escapeMarkdown(where(flow.source))}):** ${code(flow.source.code)}`);
    for (const step of flow.steps) lines.push(`- **${t('Via')} (${escapeMarkdown(where(step))}):** ${code(step.code)}`);
    lines.push(`- **${t('Sink')} (${escapeMarkdown(where(flow.sink))}):** ${code(flow.sink.code)}`);
  }
  if (rule.sourceUrls.length > 0) lines.push(`**${t('Source documents')}:** ${rule.sourceUrls.map((url) => `<${url}>`).join(' ')}`);
  if (rule.checkSteps.length > 0) {
    lines.push('', `**${t('Check steps')}:**`, ...rule.checkSteps.map((step) => `- ${escapeMarkdown(step)}`));
  }
  lines.push('', `_${candidate.flow && entry.taint?.kind === 'access'
    ? t('Compare the object owner with the signed-in user, scope the lookup to that user, or call an authorization check. If the object is public by design, record the reason.')
    : candidate.flow
    ? t('Untrusted input reaches this operation. Check whether it is validated in another file, then fix or record the reason.')
    : t('This is a review candidate found by a pattern match. A manual check and evidence are still required.')}_`);
  return lines.join('\n');
}

module.exports = { DIAGNOSTIC_SOURCE, escapeMarkdown, buildDiagnostic, buildHoverMarkdown };
