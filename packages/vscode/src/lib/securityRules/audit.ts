import type { SecurityPack } from './ruleset';
import type { Candidate, CompiledRule, FlowEngine } from './scan';

/** The audit report built from a workspace scan, and its CSV form for management sheets. */

export interface FileCandidates {
  file: string;
  candidates: Candidate[];
}

export interface AuditContext {
  generatedAt: string;
  toolName: string;
  toolVersion: string;
  workspace: string;
  rulesetVersion: string;
  /** Manifest URL the rules came from, so the report shows which ruleset decided it. */
  rulesSource?: string;
  source: 'network' | 'cache';
  scannedFiles: number;
  skippedFiles: number;
  testFilesExcluded: number;
  /** Files scanned per analysis language, so a data-flow rule can tell "no flow" from "nothing to analyze". */
  filesByLanguage: Record<string, number>;
  /** Source files in languages no rule here can analyze; they were not scanned. */
  unsupportedFiles: number;
}

export function buildAuditReport(
  packs: SecurityPack[],
  results: FileCandidates[],
  invalid: Array<{ packId: string; ruleId: string; reason: string }>,
  context: AuditContext,
  compiled: CompiledRule[] = [],
  engine?: Pick<FlowEngine, 'taintRuleCovers'>
) {
  const coveredFiles = (packId: string, ruleId: string) => {
    const taint = compiled.find((item) => item.pack.id === packId && item.rule.id === ruleId)?.taint;
    if (!taint || !engine) return 0;
    return Object.entries(context.filesByLanguage).reduce((sum, [language, count]) => sum + (engine.taintRuleCovers(taint, language) ? count : 0), 0);
  };
  const rules = packs.flatMap((pack) => pack.rules.map((rule) => {
    const locations = results.flatMap(({ file, candidates }) =>
      candidates.filter((c) => c.packId === pack.id && c.ruleId === rule.id).map((c) => ({
        file,
        line: c.startLine + 1,
        ...(c.flow ? { sourceLine: c.flow.source.line, source: c.flow.source.code, sink: c.flow.sink.code } : {}),
      }))
    );
    const method = rule.detect !== undefined ? 'dataflow' as const : rule.pattern !== undefined ? 'pattern' as const : 'manual' as const;
    const failed = invalid.some((item) => item.packId === pack.id && item.ruleId === rule.id);
    const analyzedFiles = method === 'dataflow' ? coveredFiles(pack.id, rule.id) : undefined;
    return {
      packId: pack.id,
      packVersion: pack.version,
      channel: pack.channel,
      ruleId: rule.id,
      title: rule.title,
      severity: rule.severity,
      owaspCategory: rule.owaspCategory ?? '',
      excelColumn: rule.excelColumn,
      actionRequired: rule.actionRequired,
      verification: 'manual' as const,
      method,
      // A data flow is input reaching the operation; a regex hit only marks code to look at.
      // Neither "no flow" nor "no hit" proves the item safe: the analysis stays within one file.
      status: failed
        ? 'not_evaluated' as const
        : method === 'dataflow'
          ? (locations.length > 0 ? 'flow_detected' as const : analyzedFiles === 0 ? 'no_target_files' as const : 'no_flow_detected' as const)
          : locations.length > 0 ? 'review_required' as const : 'manual_check_required' as const,
      candidateCount: locations.length,
      ...(analyzedFiles === undefined ? {} : { analyzedFiles }),
      locations,
      sourceUrls: rule.sourceUrls,
      checkSteps: rule.checkSteps,
    };
  }));
  return {
    ...context,
    compliance: 'unverified' as const,
    note: 'Data flows show untrusted input reaching a dangerous operation within one file. Pattern matches are review candidates only. Neither an empty data-flow result nor no match establishes compliance; every item still needs a manual check and evidence.',
    packs: packs.map(({ id, version, channel, mandatory, sha256, publishedAt, advisoryPublishedAt }) => ({ id, version, channel, mandatory, sha256, publishedAt, advisoryPublishedAt })),
    invalidRules: invalid,
    rules,
  };
}

export type AuditReport = ReturnType<typeof buildAuditReport>;

// Spreadsheet applications run cells that start with these characters as formulas.
function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function auditReportToCsv(report: AuditReport): string {
  const header = ['pack_id', 'pack_version', 'channel', 'rule_id', 'title', 'severity', 'owasp_category', 'excel_column', 'action_required', 'method', 'status', 'candidate_count', 'locations', 'source_urls'];
  const lines = report.rules.map((rule) => [
    rule.packId, rule.packVersion, rule.channel, rule.ruleId, rule.title, rule.severity, rule.owaspCategory, rule.excelColumn, rule.actionRequired,
    rule.method, rule.status, rule.candidateCount, rule.locations.map((l) => `${l.file}:${l.line}`).join('; '), rule.sourceUrls.join(' '),
  ].map(csvCell).join(','));
  // The BOM lets Excel open the Japanese text as UTF-8.
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

module.exports = { buildAuditReport, auditReportToCsv };
