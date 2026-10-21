import path from 'node:path';
import fs from 'node:fs/promises';
import { translator } from './i18n';
import { EXTENSION_VERSION, PRODUCT_NAME } from './settingsSchema';
import { loadEngine } from './engine';
import {
  sha256Hex,
  DEFAULT_MANIFEST_URL,
  SCAN_EXCLUDE_GLOB,
  SCAN_GLOB,
  SCAN_LIMITS,
  UNSUPPORTED_SOURCE_GLOB,
  auditReportToCsv,
  buildAuditReport,
  compileRules,
  downloadRuleset,
  escapeMarkdown,
  languageForFile,
  readRulesetCache,
  scanFile,
  writeRulesetCache,
} from './securityRules';
import type { AuditReport, Candidate, CompiledRule, FileCandidates, FlowEngine, LoadedRuleset } from './securityRules';

const LAST_SYNC_KEY = 'codeDoctor.securityRules.lastSyncAt';
const DISABLED_PACKS_KEY = 'codeDoctor.securityRules.disabledPacks';
const REPORT_DIRECTORY = path.join('.codes-doctor', 'security-audit');
const DIAGNOSTIC_SOURCE = 'Codes Doctor Security Rules';

export interface SecurityPackView {
  id: string;
  version: string;
  channel: string;
  mandatory: boolean;
  ruleCount: number;
  enabled: boolean;
}

/** What the dashboard panel shows. The scan covers only the packs that were enabled when it ran. */
export interface SecurityRulesState {
  busy: 'sync' | 'scan' | 'export' | null;
  loaded: boolean;
  source?: 'network' | 'cache';
  rulesetVersion?: string;
  syncedAt?: number;
  packs: SecurityPackView[];
  invalidRuleCount: number;
  scan?: { at: number; scannedFiles: number; skippedFiles: number; testFilesExcluded: number; unsupportedFiles: number; filesByLanguage: Record<string, number>; rules: AuditReport['rules'] };
  error?: string;
}

export interface SecurityRulesPanel {
  getState(): SecurityRulesState;
  onDidChange(listener: () => void): { dispose(): void };
  setPackEnabled(packId: string, enabled: boolean): Promise<void>;
  openLocation(file: string, line: number): Promise<void>;
}

export function createSecurityRulesController(vscode: typeof import('vscode'), context: import('vscode').ExtensionContext) {
  const t = translator(vscode);
  let engine: FlowEngine | undefined;
  // The data-flow analysis is language-independent; the Japanese build is used for it.
  const flowEngine = () => (engine ??= loadEngine('ja') as unknown as FlowEngine);
  const diagnostics = vscode.languages.createDiagnosticCollection('codeDoctorSecurityRules');
  const candidatesByUri = new Map<string, Candidate[]>();
  const listeners = new Set<() => void>();
  let ruleset: LoadedRuleset | undefined;
  let compiled: CompiledRule[] = [];
  let invalid: Array<{ packId: string; ruleId: string; reason: string }> = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy: SecurityRulesState['busy'] = null;
  let scan: SecurityRulesState['scan'];
  let error: string | undefined;

  const config = () => vscode.workspace.getConfiguration('codeDoctor.securityRules');
  const manifestUrl = () => {
    const value = config().get('sourceUrl', DEFAULT_MANIFEST_URL);
    return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_MANIFEST_URL;
  };
  const intervalHours = () => {
    const value = config().get('syncIntervalHours', 24);
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : 24;
  };
  const workspaceRoot = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  // The verified copy lives in the extension's storage, keyed by source. A copy inside the workspace
  // could be supplied by the repository under review and would decide its own audit.
  const cacheDir = () => path.join(context.globalStorageUri.fsPath, 'security-rules', sha256Hex(manifestUrl()).slice(0, 16));
  // Packs are stored as the disabled set, so a pack added upstream is on until the user turns it off.
  const disabledPacks = () => new Set(context.workspaceState.get<string[]>(DISABLED_PACKS_KEY, []));
  const activeRules = () => {
    const disabled = disabledPacks();
    return compiled.filter((item) => !disabled.has(item.pack.id));
  };
  const emit = () => listeners.forEach((listener) => listener());

  function getState(): SecurityRulesState {
    const disabled = disabledPacks();
    return {
      busy,
      loaded: Boolean(ruleset),
      source: ruleset?.source,
      rulesetVersion: ruleset?.manifest.version,
      syncedAt: context.globalState.get<number>(LAST_SYNC_KEY),
      packs: (ruleset?.packs ?? []).map((pack) => ({
        id: pack.id, version: pack.version, channel: pack.channel, mandatory: pack.mandatory, ruleCount: pack.rules.length, enabled: !disabled.has(pack.id),
      })),
      invalidRuleCount: invalid.length,
      scan,
      error,
    };
  }

  async function exclusive<T>(kind: NonNullable<SecurityRulesState['busy']>, work: () => Promise<T>): Promise<T | undefined> {
    if (busy) {
      vscode.window.setStatusBarMessage(t('Another security rules task is running.'), 3000);
      return undefined;
    }
    busy = kind;
    emit();
    try {
      return await work();
    } finally {
      busy = null;
      emit();
    }
  }

  function applyRuleset(next: LoadedRuleset) {
    ruleset = next;
    let available: FlowEngine | undefined;
    try {
      available = flowEngine();
    } catch {
      // Without the engine, rules with a detector are listed as not evaluated.
    }
    ({ compiled, invalid } = compileRules(next.packs, available));
  }

  function toDiagnostic(candidate: Candidate, uri?: import('vscode').Uri) {
    const entry = compiled.find((item) => item.pack.id === candidate.packId && item.rule.id === candidate.ruleId);
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

  function publish(uri: import('vscode').Uri, candidates: Candidate[]) {
    if (candidates.length === 0) {
      candidatesByUri.delete(uri.toString());
      diagnostics.delete(uri);
      return;
    }
    candidatesByUri.set(uri.toString(), candidates);
    diagnostics.set(uri, candidates.map((candidate) => toDiagnostic(candidate, uri)));
  }

  const isTestFile = (filePath: string) => {
    try {
      return flowEngine().isTestPath(filePath);
    } catch {
      return false;
    }
  };

  async function scanDocument(document: import('vscode').TextDocument) {
    if (!ruleset || document.uri.scheme !== 'file') return;
    const language = languageForFile(document.fileName);
    if (!language || isTestFile(document.fileName)) return;
    let available: FlowEngine | undefined;
    try {
      available = flowEngine();
    } catch {
      // Pattern rules still run without the engine.
    }
    publish(document.uri, await scanFile(document.getText(), language, document.fileName, activeRules(), available));
  }

  const rescanOpenDocuments = () => vscode.workspace.textDocuments.forEach((document) => void scanDocument(document));

  function clearFindings() {
    diagnostics.clear();
    candidatesByUri.clear();
    scan = undefined;
  }

  async function runSync(silent: boolean) {
    error = undefined;
    try {
      const downloaded = await downloadRuleset(manifestUrl());
      await writeRulesetCache(cacheDir(), downloaded);
      applyRuleset(downloaded);
      await context.globalState.update(LAST_SYNC_KEY, Date.now());
      clearFindings();
      rescanOpenDocuments();
      if (!silent) {
        vscode.window.setStatusBarMessage(t('Security rules synced: {packs} packs, {rules} rules.', {
          packs: downloaded.packs.length,
          rules: downloaded.packs.reduce((sum, pack) => sum + pack.rules.length, 0),
        }), 5000);
      }
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure);
      // Offline or a rejected download falls back to the last verified copy in the workspace.
      try {
        applyRuleset(await readRulesetCache(cacheDir()));
        clearFindings();
        rescanOpenDocuments();
        error = t('Could not sync security rules ({reason}). Using the cached rules.', { reason });
        vscode.window.showWarningMessage(error);
      } catch {
        error = t('Could not sync security rules ({reason}). No cached rules are available.', { reason });
        vscode.window.showErrorMessage(error);
      }
    }
  }

  const syncRules = () => exclusive('sync', () => runSync(false));

  type Progress = { report(value: { message?: string; increment?: number }): void };
  type Token = { isCancellationRequested: boolean };

  async function scanWorkspace(progress?: Progress, token?: Token): Promise<{
    results: FileCandidates[]; scanned: number; skipped: number; tests: number; unsupported: number; filesByLanguage: Record<string, number>;
  } | undefined> {
    const root = workspaceRoot();
    if (!root) {
      vscode.window.showErrorMessage(t('No workspace folder is open. Open a folder and try again.'));
      return undefined;
    }
    if (!ruleset) await runSync(true);
    if (!ruleset) return undefined;
    const rules = activeRules();
    if (rules.length === 0) {
      vscode.window.showWarningMessage(t('No security rule pack is selected. Select at least one pack in the Codes Doctor panel.'));
      return undefined;
    }
    const uris = await vscode.workspace.findFiles(SCAN_GLOB, SCAN_EXCLUDE_GLOB, 20000);
    const unsupported = (await vscode.workspace.findFiles(UNSUPPORTED_SOURCE_GLOB, SCAN_EXCLUDE_GLOB, 5000)).length;
    const results: FileCandidates[] = [];
    const filesByLanguage: Record<string, number> = {};
    let scanned = 0;
    let skipped = 0;
    let tests = 0;
    let total = 0;
    let available: FlowEngine | undefined;
    try {
      available = flowEngine();
    } catch {
      // Pattern rules still run without the engine.
    }
    diagnostics.clear();
    candidatesByUri.clear();
    for (const [index, uri] of uris.entries()) {
      if (token?.isCancellationRequested) {
        diagnostics.clear();
        candidatesByUri.clear();
        return undefined;
      }
      if (index % 25 === 0) progress?.report({ message: `${index}/${uris.length}`, increment: (25 / Math.max(uris.length, 1)) * 100 });
      const language = languageForFile(uri.fsPath);
      if (!language) continue;
      // Test code is not reachable from outside, and its deliberate unsafe calls were most of the noise.
      if (isTestFile(path.relative(root, uri.fsPath))) {
        tests++;
        continue;
      }
      try {
        const stat = await fs.stat(uri.fsPath);
        if (stat.size > SCAN_LIMITS.maxFileBytes) {
          skipped++;
          continue;
        }
        const candidates = await scanFile(await fs.readFile(uri.fsPath, 'utf8'), language, uri.fsPath, rules, available);
        scanned++;
        filesByLanguage[language] = (filesByLanguage[language] ?? 0) + 1;
        if (candidates.length === 0) continue;
        publish(uri, candidates);
        results.push({ file: path.relative(root, uri.fsPath).split(path.sep).join('/'), candidates });
        total += candidates.length;
        if (total >= SCAN_LIMITS.maxTotalCandidates) break;
      } catch {
        skipped++;
      }
    }
    return { results, scanned, skipped, tests, unsupported, filesByLanguage };
  }

  function buildReport(outcome: NonNullable<Awaited<ReturnType<typeof scanWorkspace>>>, root: string) {
    const disabled = disabledPacks();
    return buildAuditReport(
      (ruleset?.packs ?? []).filter((pack) => !disabled.has(pack.id)),
      outcome.results,
      invalid,
      {
        generatedAt: new Date().toISOString(),
        toolName: PRODUCT_NAME,
        toolVersion: EXTENSION_VERSION,
        workspace: path.basename(root),
        rulesetVersion: ruleset?.manifest.version ?? '',
        rulesSource: manifestUrl(),
        source: ruleset?.source ?? 'cache',
        scannedFiles: outcome.scanned,
        skippedFiles: outcome.skipped,
        testFilesExcluded: outcome.tests,
        filesByLanguage: outcome.filesByLanguage,
        unsupportedFiles: outcome.unsupported,
      },
      compiled,
      engine
    );
  }

  async function runScan(progress?: Progress, token?: Token): Promise<AuditReport | undefined> {
    const root = workspaceRoot();
    const outcome = await scanWorkspace(progress, token);
    if (!root || !outcome) {
      if (token?.isCancellationRequested) vscode.window.setStatusBarMessage(t('Security rules scan cancelled.'), 5000);
      return undefined;
    }
    const report = buildReport(outcome, root);
    scan = {
      at: Date.now(), scannedFiles: outcome.scanned, skippedFiles: outcome.skipped, testFilesExcluded: outcome.tests,
      unsupportedFiles: outcome.unsupported, filesByLanguage: outcome.filesByLanguage, rules: report.rules,
    };
    return report;
  }

  const withProgress = <T>(title: string, work: (progress: Progress, token: Token) => Promise<T>) =>
    Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, work));

  const scanSecurityRules = () => exclusive('scan', async () => {
    const report = await withProgress(t('Security rules scan running'), runScan);
    if (!report) return;
    const flows = report.rules.filter((rule) => rule.method === 'dataflow').reduce((sum, rule) => sum + rule.candidateCount, 0);
    vscode.window.setStatusBarMessage(t('Security rules scan finished: {count} input flows found. "No flow found" is not proof of safety.', { count: flows }), 8000);
  });

  const exportReport = () => exclusive('export', async () => {
    const root = workspaceRoot();
    const report = await withProgress(t('Security rules scan running'), runScan);
    if (!root || !report) return;
    const directory = path.join(root, REPORT_DIRECTORY);
    const stamp = report.generatedAt.replace(/[:.]/g, '-');
    const csvPath = path.join(directory, `security-audit-${stamp}.csv`);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `security-audit-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(csvPath, auditReportToCsv(report), 'utf8');
    const open = t('Open CSV');
    // Not awaited: the panel must not stay busy while a notification waits for a click.
    void Promise.resolve(vscode.window.showInformationMessage(
      t('Security audit report saved to {directory}. Items are review candidates, not a compliance verdict.', { directory: REPORT_DIRECTORY }),
      open
    )).then((choice) => (choice === open ? vscode.commands.executeCommand('vscode.open', vscode.Uri.file(csvPath)) : undefined));
  });

  async function setPackEnabled(packId: string, enabled: boolean) {
    if (!ruleset?.packs.some((pack) => pack.id === packId)) return;
    const disabled = disabledPacks();
    if (enabled) disabled.delete(packId);
    else disabled.add(packId);
    await context.workspaceState.update(DISABLED_PACKS_KEY, [...disabled]);
    // Earlier findings came from a different selection, so they are dropped rather than left to mislead.
    clearFindings();
    rescanOpenDocuments();
    emit();
  }

  async function openLocation(file: string, line: number) {
    const root = workspaceRoot();
    // Only locations from the last scan are opened, so a message cannot point the editor at an arbitrary path.
    const known = scan?.rules.some((rule) => rule.locations.some((location) => location.file === file && location.line === line));
    if (!root || !known) return;
    const target = path.resolve(root, file);
    if (!target.startsWith(root + path.sep)) return;
    const position = new vscode.Position(Math.max(line - 1, 0), 0);
    await vscode.window.showTextDocument(vscode.Uri.file(target), { selection: new vscode.Range(position, position) });
  }

  function hoverMarkdown(candidate: Candidate): string | undefined {
    const entry = compiled.find((item) => item.pack.id === candidate.packId && item.rule.id === candidate.ruleId);
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
      ? t('Untrusted input reaches this operation within one function. Check whether it is validated elsewhere, then fix or record the reason.')
      : t('This is a review candidate found by a pattern match. A manual check and evidence are still required.')}_`);
    return lines.join('\n');
  }

  const hoverProvider: import('vscode').HoverProvider = {
    provideHover(document, position) {
      const candidates = candidatesByUri.get(document.uri.toString());
      if (!candidates) return null;
      const blocks = candidates
        .filter((c) => new vscode.Range(c.startLine, c.startColumn, c.endLine, c.endColumn).contains(position))
        .map(hoverMarkdown)
        .filter((block): block is string => Boolean(block));
      if (blocks.length === 0) return null;
      const markdown = new vscode.MarkdownString(blocks.join('\n\n---\n\n'));
      markdown.isTrusted = false;
      return new vscode.Hover(markdown);
    },
  };

  function startAutoSync() {
    if (!config().get('autoSync', false)) return;
    const lastSync = context.globalState.get<number>(LAST_SYNC_KEY, 0);
    const interval = intervalHours() * 3600 * 1000;
    const sync = () => void exclusive('sync', () => runSync(true));
    if (Date.now() - lastSync >= interval) sync();
    timer = setInterval(sync, interval);
  }

  // Loading the workspace copy is local only; the network is touched by an explicit sync or by autoSync.
  async function initialize() {
    try {
      applyRuleset(await readRulesetCache(cacheDir()));
      rescanOpenDocuments();
      emit();
    } catch {
      // No usable cache yet.
    }
    startAutoSync();
  }

  const subscriptions: Array<{ dispose(): unknown }> = [
    diagnostics,
    vscode.workspace.onDidOpenTextDocument((document) => void scanDocument(document)),
    vscode.workspace.onDidSaveTextDocument((document) => void scanDocument(document)),
  ];

  const panel: SecurityRulesPanel = {
    getState,
    onDidChange(listener) {
      listeners.add(listener);
      return { dispose: () => void listeners.delete(listener) };
    },
    setPackEnabled,
    openLocation,
  };

  return {
    initialize,
    syncRules,
    scanSecurityRules,
    exportReport,
    hoverProvider,
    panel,
    dispose() {
      if (timer) clearInterval(timer);
      listeners.clear();
      subscriptions.forEach((item) => item.dispose());
    },
  };
}

module.exports = { createSecurityRulesController };
