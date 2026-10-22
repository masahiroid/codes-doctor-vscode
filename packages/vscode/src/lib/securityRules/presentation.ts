import type { Candidate, CompiledRule } from './scan';

type Translate = (message: string, values?: Record<string, unknown>) => string;

export const DIAGNOSTIC_SOURCE = 'Codes Doctor Security Rules';

/** Escape Markdown syntax in rule text that came from the network. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()<>#+!|~&-]/g, '\\$&');
}

/** A Problems entry for one candidate; a data flow links its source and the lines it passed through. */
export function buildDiagnostic(vscode: typeof import('vscode'), t: Translate, entry: CompiledRule | undefined, candidate: Candidate, uri?: import('vscode').Uri) {
  const severity = entry?.rule.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning;
  const range = new vscode.Range(candidate.startLine, candidate.startColumn, candidate.endLine, candidate.endColumn);
  const flow = candidate.flow;
  const message = flow
    ? `[${candidate.ruleId}] ${t('Input reaches')}: ${entry?.rule.title ?? candidate.ruleId} — ${t('input from line {line} reaches this call', { line: flow.source.line })}`
    : `[${candidate.ruleId}] ${t('Review required')}: ${entry?.rule.title ?? candidate.ruleId} — ${entry?.rule.message ?? ''}`;
  const diagnostic = new vscode.Diagnostic(range, message, severity);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = candidate.ruleId;
  if (flow && uri) {
    const at = (line: number) => new vscode.Location(uri, new vscode.Range(Math.max(line - 1, 0), 0, Math.max(line - 1, 0), 200));
    diagnostic.relatedInformation = [
      new vscode.DiagnosticRelatedInformation(at(flow.source.line), `${t('Source')}: ${flow.source.code}`),
      ...flow.steps.map((step) => new vscode.DiagnosticRelatedInformation(at(step.line), `${t('Via')}: ${step.code}`)),
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
    lines.push('', `**${t('Traced Data Flow')}:**`, `- **${t('Source')} (L${candidate.flow.source.line}):** ${code(candidate.flow.source.code)}`);
    for (const step of candidate.flow.steps) lines.push(`- **${t('Via')} (L${step.line}):** ${code(step.code)}`);
    lines.push(`- **${t('Sink')} (L${candidate.flow.sink.line}):** ${code(candidate.flow.sink.code)}`);
  }
  if (rule.sourceUrls.length > 0) lines.push(`**${t('Source documents')}:** ${rule.sourceUrls.map((url) => `<${url}>`).join(' ')}`);
  if (rule.checkSteps.length > 0) {
    lines.push('', `**${t('Check steps')}:**`, ...rule.checkSteps.map((step) => `- ${escapeMarkdown(step)}`));
  }
  lines.push('', `_${candidate.flow
    ? t('Untrusted input reaches this operation. Check whether it is validated in another file, then fix or record the reason.')
    : t('This is a review candidate found by a pattern match. A manual check and evidence are still required.')}_`);
  return lines.join('\n');
}

module.exports = { DIAGNOSTIC_SOURCE, escapeMarkdown, buildDiagnostic, buildHoverMarkdown };
