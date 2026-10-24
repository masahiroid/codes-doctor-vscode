import path from 'node:path';
import fs from 'node:fs/promises';
import { EXTENSION_VERSION, PRODUCT_NAME } from '../settingsSchema';
import type { LoadedRuleset } from './ruleset';
import type { CompiledRule, FlowEngine } from './scan';
import { auditReportToCsv, buildAuditReport } from './audit';
import type { AuditReport } from './audit';
import type { WorkspaceScan } from './workspaceScan';

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
  return buildAuditReport(
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
 * Write the report as JSON and CSV under the workspace's report directory, both named after the
 * report's time. Returns the CSV path, which the user is offered to open.
 */
export async function writeAuditReportFiles(root: string, report: AuditReport): Promise<{ csvPath: string }> {
  const directory = path.join(root, REPORT_DIRECTORY);
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const csvPath = path.join(directory, `security-audit-${stamp}.csv`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `security-audit-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(csvPath, auditReportToCsv(report), 'utf8');
  return { csvPath };
}

module.exports = { REPORT_DIRECTORY, buildWorkspaceAuditReport, writeAuditReportFiles };
