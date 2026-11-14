import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AuditOptions } from './options';

type Engine = typeof import('../vendor/csap-en');
type Rules = Engine['securityRules'];
type LoadedRuleset = import('../vendor/csap-en/securityRules').LoadedRuleset;
type SecurityPack = import('../vendor/csap-en/securityRules').SecurityPack;
type AuditReport = import('../vendor/csap-en/securityRules').AuditReport;
type EvidenceFile = import('../vendor/csap-en/securityRules').EvidenceFile;
type RulesetChanges = import('../vendor/csap-en/securityRules').RulesetChanges;

export interface AuditSummary {
  reportFiles: string[];
  rulesetVersion: string;
  rulesSource: string;
  rulesFrom: 'network' | 'cache';
  packs: Array<{ id: string; version: string; channel: string }>;
  scannedFiles: number;
  /** Rules per audit status, e.g. { flow_detected: 2, manual_check_required: 5 }. */
  statuses: Record<string, number>;
  /** Input flows and missing ownership checks found. */
  findings: number;
  invalidRules: number;
  /** Changes since the cached rules; absent on the first download or offline. */
  rulesetChanges?: RulesetChanges;
  evidence?: { path: string; written: boolean; added: number; invalidated: number; removed: number };
  evidenceCheck?: { failures: string[]; warnings: string[] };
  /** Notes on the run, e.g. a failed download that fell back to the cache. */
  notices: string[];
  failures: string[];
}

/** The user cache folder for a manifest URL, outside any repository under review. */
function defaultCacheDir(rules: Rules, manifestUrl: string): string {
  const base = process.env.XDG_CACHE_HOME || (process.platform === 'win32' ? process.env.LOCALAPPDATA : undefined) || path.join(os.homedir(), '.cache');
  return path.join(base as string, 'codes-doctor', 'security-rules', rules.sha256Hex(manifestUrl).slice(0, 16));
}

async function readCache(rules: Rules, dir: string): Promise<LoadedRuleset | undefined> {
  try {
    return await rules.readRulesetCache(dir);
  } catch {
    return undefined;
  }
}

/** Download the rules (falling back to the cache) and compare them with the cached copy. */
async function loadRules(rules: Rules, manifestUrl: string, cacheDir: string, offline: boolean, notices: string[]) {
  const cached = await readCache(rules, cacheDir);
  if (offline) {
    if (!cached) throw new Error(`No cached rules in ${cacheDir}; run once without --offline`);
    return { ruleset: cached, changes: undefined };
  }
  try {
    const downloaded = await rules.downloadRuleset(manifestUrl);
    await rules.writeRulesetCache(cacheDir, downloaded);
    return { ruleset: downloaded, changes: cached ? rules.compareRulesets(cached.packs, downloaded.packs) : undefined };
  } catch (error) {
    if (!cached) throw error;
    notices.push(`Could not download the rules (${error instanceof Error ? error.message : String(error)}); using the cached rules ${cached.manifest.version}`);
    return { ruleset: cached, changes: undefined };
  }
}

function selectPacks(packs: SecurityPack[], options: AuditOptions): SecurityPack[] {
  const unknown = options.packs.find((id) => !packs.some((pack) => pack.id === id));
  if (unknown) throw new Error(`Unknown pack: ${unknown} (available: ${packs.map((pack) => pack.id).join(', ')})`);
  const selected = packs.filter((pack) =>
    (options.channels.length === 0 || options.channels.includes(pack.channel)) && (options.packs.length === 0 || options.packs.includes(pack.id)));
  if (selected.length === 0) throw new Error('No rule pack matches --channel / --pack');
  return selected;
}

async function readEvidence(rules: Rules, file: string): Promise<EvidenceFile | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return rules.parseEvidence(text);
}

/** Replace a file in one step, so an interrupted run never leaves half an evidence file. */
async function writeAtomic(file: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, data);
  await fs.rename(temp, file);
}

export async function audit(engine: Engine, options: AuditOptions, toolVersion: string): Promise<AuditSummary> {
  const rules = engine.securityRules;
  const notices: string[] = [];
  const failures: string[] = [];
  const manifestUrl = options.rulesUrl ?? rules.DEFAULT_MANIFEST_URL;
  const cacheDir = options.rulesCache ?? defaultCacheDir(rules, manifestUrl);
  const { ruleset, changes } = await loadRules(rules, manifestUrl, cacheDir, options.offline, notices);
  const packs = selectPacks(ruleset.packs, options);

  // The engine's flow functions, typed as the opaque interface the rules modules take (as the extension does).
  const flow = engine as unknown as import('../vendor/csap-en/securityRules').FlowEngine;
  const { compiled, invalid } = rules.compileRules(packs, flow);
  const { files, unsupported } = await rules.listSourceFiles(options.repoPath);
  const outcome = await rules.scanFiles({ root: options.repoPath, files, unsupported, rules: compiled, engine: flow });
  if (!outcome) throw new Error('The scan was cancelled');
  const report: AuditReport = rules.buildAuditReport(packs, outcome.results, invalid, {
    generatedAt: new Date().toISOString(),
    toolName: engine.PRODUCT_NAME,
    toolVersion: `cli ${toolVersion}`,
    workspace: path.basename(options.repoPath),
    rulesetVersion: ruleset.manifest.version,
    rulesSource: manifestUrl,
    source: ruleset.source,
    scannedFiles: outcome.scanned,
    skippedFiles: outcome.skipped,
    testFilesExcluded: outcome.tests,
    filesByLanguage: outcome.filesByLanguage,
    unsupportedFiles: outcome.unsupported,
  }, compiled, flow);

  // Evidence: --check verifies it as committed; otherwise it is created or brought up to date.
  let evidence: EvidenceFile | undefined;
  let evidenceSummary: AuditSummary['evidence'];
  let evidenceCheck: AuditSummary['evidenceCheck'];
  if (options.evidencePath && options.target) {
    const existing = await readEvidence(rules, options.evidencePath);
    if (options.check) {
      if (!existing) throw new Error(`Evidence file not found: ${options.evidencePath}`);
      evidence = existing;
      evidenceCheck = rules.checkEvidence(packs, existing, options.target, new Date(), report);
      failures.push(...evidenceCheck.failures.map((failure) => `evidence: ${failure}`));
    } else {
      const update = rules.updateEvidence(packs, existing, options.target, report);
      evidence = update.evidence;
      await writeAtomic(options.evidencePath, `${JSON.stringify(update.evidence, null, 2)}\n`);
      evidenceSummary = { path: options.evidencePath, written: true, added: update.added.length, invalidated: update.invalidated.length, removed: update.removed.length };
    }
  }

  const findings = report.rules
    .filter((rule) => rule.status === 'flow_detected' || rule.status === 'owner_check_missing')
    .reduce((sum, rule) => sum + rule.candidateCount, 0);
  if (options.failOnFindings && findings > 0) failures.push(`input flows or missing ownership checks found: ${findings}`);
  if (invalid.length > 0) notices.push(`${invalid.length} rule(s) could not be evaluated: ${invalid.map((item) => `${item.packId}/${item.ruleId} (${item.reason})`).join('; ')}`);

  const reportFiles: string[] = [];
  const write = async (name: string, data: string | Buffer) => {
    const file = path.join(options.outputDir, name);
    await writeAtomic(file, data);
    reportFiles.push(file);
  };
  if (options.formats.includes('json')) {
    await write('security-audit.json', `${JSON.stringify({ ...report, ...(changes ? { rulesetChanges: changes } : {}), ...(evidenceCheck ? { evidenceCheck } : {}) }, null, 2)}\n`);
  }
  if (options.formats.includes('csv')) {
    await write('security-audit.csv', rules.auditReportToCsv(report));
    await write('security-audit-sheet.csv', rules.submissionCsv(report, evidence));
  }
  if (options.formats.includes('xlsx')) await write('security-audit.xlsx', rules.submissionXlsx(report, evidence));

  const statuses: Record<string, number> = {};
  for (const rule of report.rules) statuses[rule.status] = (statuses[rule.status] ?? 0) + 1;
  return {
    reportFiles,
    rulesetVersion: ruleset.manifest.version,
    rulesSource: manifestUrl,
    rulesFrom: ruleset.source,
    packs: packs.map((pack) => ({ id: pack.id, version: pack.version, channel: pack.channel })),
    scannedFiles: outcome.scanned,
    statuses,
    findings,
    invalidRules: invalid.length,
    ...(changes ? { rulesetChanges: changes } : {}),
    ...(evidenceSummary ? { evidence: evidenceSummary } : {}),
    ...(evidenceCheck ? { evidenceCheck } : {}),
    notices,
    failures,
  };
}

const count = (changes: RulesetChanges) => Object.values(changes).reduce((sum, list) => sum + list.length, 0);

export function formatAuditSummary(summary: AuditSummary): string {
  const lines = [
    `Rules: ${summary.rulesetVersion} (${summary.rulesFrom === 'network' ? 'downloaded' : 'cached'}) — ${summary.packs.map((pack) => `${pack.id} ${pack.version} [${pack.channel}]`).join(', ')}`,
    `Scanned files: ${summary.scannedFiles}`,
    `Results: ${Object.entries(summary.statuses).map(([status, n]) => `${status} ${n}`).join(', ')}`,
    `Input flows / missing ownership checks: ${summary.findings}`,
  ];
  const changes = summary.rulesetChanges;
  if (changes && count(changes) > 0) {
    lines.push('', 'Rules changed since the last run — check these again:');
    for (const rule of changes.fixReleased) lines.push(`  ! fix released: ${rule.packId}/${rule.ruleId} ${rule.title}${rule.from ? ` (was ${rule.from})` : ''}`);
    for (const pack of changes.addedPacks) lines.push(`  + pack ${pack.id} ${pack.version} [${pack.channel}]`);
    for (const pack of changes.updatedPacks) lines.push(`  ~ pack ${pack.id} ${pack.from} -> ${pack.to} [${pack.channel}]`);
    for (const pack of changes.removedPacks) lines.push(`  - pack ${pack.id} ${pack.version}`);
    for (const rule of changes.addedRules) lines.push(`  + ${rule.packId}/${rule.ruleId} ${rule.title}`);
    for (const rule of changes.changedRules) lines.push(`  ~ ${rule.packId}/${rule.ruleId} ${rule.title}`);
    for (const rule of changes.removedRules) lines.push(`  - ${rule.packId}/${rule.ruleId} ${rule.title}`);
  }
  if (summary.evidence) {
    lines.push('', `Evidence updated: ${summary.evidence.path} (new ${summary.evidence.added}, reset by rule changes ${summary.evidence.invalidated}, removed ${summary.evidence.removed})`);
  }
  if (summary.evidenceCheck) {
    lines.push('', summary.evidenceCheck.failures.length === 0 ? 'Evidence check: passed' : `Evidence check: ${summary.evidenceCheck.failures.length} problem(s)`);
    for (const failure of summary.evidenceCheck.failures) lines.push(`  ✗ ${failure}`);
    for (const warning of summary.evidenceCheck.warnings) lines.push(`  ! ${warning}`);
  }
  for (const notice of summary.notices) lines.push(`Note: ${notice}`);
  lines.push('', 'Automatic results are review candidates; "no flow found" is not proof of safety.');
  lines.push(...summary.reportFiles.map((file) => `Wrote ${file}`));
  if (summary.failures.length > 0) lines.push('', `FAILED: ${summary.failures.length} check(s) did not pass`);
  return lines.join('\n');
}
