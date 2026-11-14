import path from 'node:path';
import fs from 'node:fs/promises';
import { EXTENSION_VERSION, PRODUCT_NAME } from '../settingsSchema';
import { loadEngine } from '../engine';
import type { ReportLanguage } from '../engine';
import { rulesModule } from './rules';
import type { AuditReport, CompiledRule, FlowEngine, LoadedRuleset, WorkspaceScan } from './rules';

/** Where audit reports are written, relative to the workspace folder. */
export const REPORT_DIRECTORY = path.join('.codes-doctor', 'security-audit');

/**
 * The audit report of a workspace scan: the enabled packs' results with the tool, ruleset and
 * coverage details an audit needs to tell which rules decided it and what was analyzed.
 */
export function buildWorkspaceAuditReport(input: {
  root: string;
  ruleset: LoadedRuleset | undefined;
  disabledPacks: ReadonlySet<string>;
  rulesSource: string;
  outcome: WorkspaceScan;
  invalid: Array<{ packId: string; ruleId: string; reason: string }>;
  compiled: CompiledRule[];
  engine?: FlowEngine;
}): AuditReport {
  const { root, ruleset, outcome } = input;
  return rulesModule().buildAuditReport(
    (ruleset?.packs ?? []).filter((pack) => !input.disabledPacks.has(pack.id)),
    outcome.results,
    input.invalid,
    {
      generatedAt: new Date().toISOString(),
      toolName: PRODUCT_NAME,
      toolVersion: EXTENSION_VERSION,
      workspace: path.basename(root),
      rulesetVersion: ruleset?.manifest.version ?? '',
      rulesSource: input.rulesSource,
      source: ruleset?.source ?? 'cache',
      scannedFiles: outcome.scanned,
      skippedFiles: outcome.skipped,
      testFilesExcluded: outcome.tests,
      filesByLanguage: outcome.filesByLanguage,
      unsupportedFiles: outcome.unsupported,
    },
    input.compiled,
    input.engine
  );
}

/**
 * Write the report as JSON and CSV, and the management sheet as CSV and Excel, under the workspace's
 * report directory, all named after the report's time. The sheet's labels follow `language`.
 * Returns the CSV and Excel paths; the user is offered to open the CSV.
 */
export async function writeAuditReportFiles(root: string, report: AuditReport, language: ReportLanguage = 'ja'): Promise<{ csvPath: string; xlsxPath: string }> {
  const directory = path.join(root, REPORT_DIRECTORY);
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const csvPath = path.join(directory, `security-audit-${stamp}.csv`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `security-audit-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(csvPath, rulesModule().auditReportToCsv(report), 'utf8');
  // Each engine build carries the sheet labels in its own language.
  const sheets = loadEngine(language).securityRules;
  const xlsxPath = path.join(directory, `security-audit-${stamp}.xlsx`);
  await fs.writeFile(path.join(directory, `security-audit-${stamp}-sheet.csv`), sheets.submissionCsv(report), 'utf8');
  await fs.writeFile(xlsxPath, sheets.submissionXlsx(report));
  return { csvPath, xlsxPath };
}

module.exports = { REPORT_DIRECTORY, buildWorkspaceAuditReport, writeAuditReportFiles };
