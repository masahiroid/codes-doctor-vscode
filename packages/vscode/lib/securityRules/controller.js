"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSecurityRulesController = createSecurityRulesController;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const i18n_1 = require("../i18n");
const settingsSchema_1 = require("../settingsSchema");
const engine_1 = require("../engine");
const ruleset_1 = require("./ruleset");
const scan_1 = require("./scan");
const audit_1 = require("./audit");
const presentation_1 = require("./presentation");
const workspaceScan_1 = require("./workspaceScan");
const LAST_SYNC_KEY = 'codeDoctor.securityRules.lastSyncAt';
const DISABLED_PACKS_KEY = 'codeDoctor.securityRules.disabledPacks';
const REPORT_DIRECTORY = node_path_1.default.join('.codes-doctor', 'security-audit');
function createSecurityRulesController(vscode, context) {
    const t = (0, i18n_1.translator)(vscode);
    let engine;
    // The data-flow analysis is language-independent; the Japanese build is used for it.
    const flowEngine = () => (engine ??= (0, engine_1.loadEngine)('ja'));
    const diagnostics = vscode.languages.createDiagnosticCollection('codeDoctorSecurityRules');
    const candidatesByUri = new Map();
    const listeners = new Set();
    let ruleset;
    let compiled = [];
    let invalid = [];
    let timer;
    let busy = null;
    let scan;
    let error;
    /** Function summaries from the last workspace scan; single files are scanned against them. */
    let projectIndex;
    const config = () => vscode.workspace.getConfiguration('codeDoctor.securityRules');
    const manifestUrl = () => {
        const value = config().get('sourceUrl', ruleset_1.DEFAULT_MANIFEST_URL);
        return typeof value === 'string' && value.trim() ? value.trim() : ruleset_1.DEFAULT_MANIFEST_URL;
    };
    const intervalHours = () => {
        const value = config().get('syncIntervalHours', 24);
        return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : 24;
    };
    const workspaceRoot = () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    // The verified copy lives in the extension's storage, keyed by source. A copy inside the workspace
    // could be supplied by the repository under review and would decide its own audit.
    const cacheDir = () => node_path_1.default.join(context.globalStorageUri.fsPath, 'security-rules', (0, ruleset_1.sha256Hex)(manifestUrl()).slice(0, 16));
    // Packs are stored as the disabled set, so a pack added upstream is on until the user turns it off.
    const disabledPacks = () => new Set(context.workspaceState.get(DISABLED_PACKS_KEY, []));
    const activeRules = () => {
        const disabled = disabledPacks();
        return compiled.filter((item) => !disabled.has(item.pack.id));
    };
    const emit = () => listeners.forEach((listener) => listener());
    function getState() {
        const disabled = disabledPacks();
        return {
            busy,
            loaded: Boolean(ruleset),
            source: ruleset?.source,
            rulesetVersion: ruleset?.manifest.version,
            syncedAt: context.globalState.get(LAST_SYNC_KEY),
            packs: (ruleset?.packs ?? []).map((pack) => ({
                id: pack.id, version: pack.version, channel: pack.channel, mandatory: pack.mandatory, ruleCount: pack.rules.length, enabled: !disabled.has(pack.id),
            })),
            invalidRuleCount: invalid.length,
            scan,
            error,
        };
    }
    async function exclusive(kind, work) {
        if (busy) {
            vscode.window.setStatusBarMessage(t('Another security rules task is running.'), 3000);
            return undefined;
        }
        busy = kind;
        emit();
        try {
            return await work();
        }
        finally {
            busy = null;
            emit();
        }
    }
    function applyRuleset(next) {
        ruleset = next;
        let available;
        try {
            available = flowEngine();
        }
        catch {
            // Without the engine, rules with a detector are listed as not evaluated.
        }
        ({ compiled, invalid } = (0, scan_1.compileRules)(next.packs, available));
    }
    const ruleFor = (candidate) => compiled.find((item) => item.pack.id === candidate.packId && item.rule.id === candidate.ruleId);
    function publish(uri, candidates) {
        if (candidates.length === 0) {
            candidatesByUri.delete(uri.toString());
            diagnostics.delete(uri);
            return;
        }
        candidatesByUri.set(uri.toString(), candidates);
        diagnostics.set(uri, candidates.map((candidate) => (0, presentation_1.buildDiagnostic)(vscode, t, ruleFor(candidate), candidate, uri)));
    }
    const isTestFile = (filePath) => {
        try {
            return flowEngine().isTestPath(filePath);
        }
        catch {
            return false;
        }
    };
    async function scanDocument(document) {
        if (!ruleset || document.uri.scheme !== 'file')
            return;
        const language = (0, scan_1.languageForFile)(document.fileName);
        if (!language || isTestFile(document.fileName))
            return;
        let available;
        try {
            available = flowEngine();
        }
        catch {
            // Pattern rules still run without the engine.
        }
        publish(document.uri, await (0, scan_1.scanFile)(document.getText(), language, document.fileName, activeRules(), available, projectIndex));
    }
    const rescanOpenDocuments = () => vscode.workspace.textDocuments.forEach((document) => void scanDocument(document));
    function clearFindings() {
        diagnostics.clear();
        candidatesByUri.clear();
        scan = undefined;
        // Summaries belong to the rules they were built with.
        projectIndex = undefined;
    }
    async function runSync(silent) {
        error = undefined;
        try {
            const downloaded = await (0, ruleset_1.downloadRuleset)(manifestUrl());
            await (0, ruleset_1.writeRulesetCache)(cacheDir(), downloaded);
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
        }
        catch (failure) {
            const reason = failure instanceof Error ? failure.message : String(failure);
            // Offline or a rejected download falls back to the last verified copy in the workspace.
            try {
                applyRuleset(await (0, ruleset_1.readRulesetCache)(cacheDir()));
                clearFindings();
                rescanOpenDocuments();
                error = t('Could not sync security rules ({reason}). Using the cached rules.', { reason });
                vscode.window.showWarningMessage(error);
            }
            catch {
                error = t('Could not sync security rules ({reason}). No cached rules are available.', { reason });
                vscode.window.showErrorMessage(error);
            }
        }
    }
    const syncRules = () => exclusive('sync', () => runSync(false));
    async function scanWorkspace(progress, token) {
        const root = workspaceRoot();
        if (!root) {
            vscode.window.showErrorMessage(t('No workspace folder is open. Open a folder and try again.'));
            return undefined;
        }
        if (!ruleset)
            await runSync(true);
        if (!ruleset)
            return undefined;
        const rules = activeRules();
        if (rules.length === 0) {
            vscode.window.showWarningMessage(t('No security rule pack is selected. Select at least one pack in the Codes Doctor panel.'));
            return undefined;
        }
        let available;
        try {
            available = flowEngine();
        }
        catch {
            // Pattern rules still run without the engine.
        }
        diagnostics.clear();
        candidatesByUri.clear();
        const outcome = await (0, workspaceScan_1.scanWorkspaceFiles)(vscode, {
            root, rules, engine: available, onFindings: publish, progress, token,
            labels: { summarizing: t('Following calls between files…'), scanning: t('Scanning files') },
        });
        if (outcome)
            projectIndex = outcome.index;
        if (!outcome) {
            diagnostics.clear();
            candidatesByUri.clear();
        }
        return outcome;
    }
    function buildReport(outcome, root) {
        const disabled = disabledPacks();
        return (0, audit_1.buildAuditReport)((ruleset?.packs ?? []).filter((pack) => !disabled.has(pack.id)), outcome.results, invalid, {
            generatedAt: new Date().toISOString(),
            toolName: settingsSchema_1.PRODUCT_NAME,
            toolVersion: settingsSchema_1.EXTENSION_VERSION,
            workspace: node_path_1.default.basename(root),
            rulesetVersion: ruleset?.manifest.version ?? '',
            rulesSource: manifestUrl(),
            source: ruleset?.source ?? 'cache',
            scannedFiles: outcome.scanned,
            skippedFiles: outcome.skipped,
            testFilesExcluded: outcome.tests,
            filesByLanguage: outcome.filesByLanguage,
            unsupportedFiles: outcome.unsupported,
        }, compiled, engine);
    }
    async function runScan(progress, token) {
        const root = workspaceRoot();
        const outcome = await scanWorkspace(progress, token);
        if (!root || !outcome) {
            if (token?.isCancellationRequested)
                vscode.window.setStatusBarMessage(t('Security rules scan cancelled.'), 5000);
            return undefined;
        }
        const report = buildReport(outcome, root);
        scan = {
            at: Date.now(), scannedFiles: outcome.scanned, skippedFiles: outcome.skipped, testFilesExcluded: outcome.tests,
            unsupportedFiles: outcome.unsupported, filesByLanguage: outcome.filesByLanguage, rules: report.rules,
        };
        return report;
    }
    const withProgress = (title, work) => Promise.resolve(vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title, cancellable: true }, work));
    const scanSecurityRules = () => exclusive('scan', async () => {
        const report = await withProgress(t('Security rules scan running'), runScan);
        if (!report)
            return;
        const flows = report.rules.filter((rule) => rule.method === 'dataflow').reduce((sum, rule) => sum + rule.candidateCount, 0);
        vscode.window.setStatusBarMessage(t('Security rules scan finished: {count} input flows found. "No flow found" is not proof of safety.', { count: flows }), 8000);
    });
    const exportReport = () => exclusive('export', async () => {
        const root = workspaceRoot();
        const report = await withProgress(t('Security rules scan running'), runScan);
        if (!root || !report)
            return;
        const directory = node_path_1.default.join(root, REPORT_DIRECTORY);
        const stamp = report.generatedAt.replace(/[:.]/g, '-');
        const csvPath = node_path_1.default.join(directory, `security-audit-${stamp}.csv`);
        await promises_1.default.mkdir(directory, { recursive: true });
        await promises_1.default.writeFile(node_path_1.default.join(directory, `security-audit-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        await promises_1.default.writeFile(csvPath, (0, audit_1.auditReportToCsv)(report), 'utf8');
        const open = t('Open CSV');
        // Not awaited: the panel must not stay busy while a notification waits for a click.
        void Promise.resolve(vscode.window.showInformationMessage(t('Security audit report saved to {directory}. Items are review candidates, not a compliance verdict.', { directory: REPORT_DIRECTORY }), open)).then((choice) => (choice === open ? vscode.commands.executeCommand('vscode.open', vscode.Uri.file(csvPath)) : undefined));
    });
    async function setPackEnabled(packId, enabled) {
        if (!ruleset?.packs.some((pack) => pack.id === packId))
            return;
        const disabled = disabledPacks();
        if (enabled)
            disabled.delete(packId);
        else
            disabled.add(packId);
        await context.workspaceState.update(DISABLED_PACKS_KEY, [...disabled]);
        // Earlier findings came from a different selection, so they are dropped rather than left to mislead.
        clearFindings();
        rescanOpenDocuments();
        emit();
    }
    async function openLocation(file, line) {
        const root = workspaceRoot();
        // Only locations from the last scan are opened, so a message cannot point the editor at an arbitrary path.
        const known = scan?.rules.some((rule) => rule.locations.some((location) => location.file === file && location.line === line)
            || (rule.endpoints ?? []).some((endpoint) => endpoint.file === file && endpoint.line === line));
        if (!root || !known)
            return;
        const target = node_path_1.default.resolve(root, file);
        if (!target.startsWith(root + node_path_1.default.sep))
            return;
        const position = new vscode.Position(Math.max(line - 1, 0), 0);
        await vscode.window.showTextDocument(vscode.Uri.file(target), { selection: new vscode.Range(position, position) });
    }
    const hoverProvider = {
        provideHover(document, position) {
            const candidates = candidatesByUri.get(document.uri.toString());
            if (!candidates)
                return null;
            const blocks = candidates
                .filter((c) => new vscode.Range(c.startLine, c.startColumn, c.endLine, c.endColumn).contains(position))
                .map((candidate) => (0, presentation_1.buildHoverMarkdown)(t, ruleFor(candidate), candidate))
                .filter((block) => Boolean(block));
            if (blocks.length === 0)
                return null;
            const markdown = new vscode.MarkdownString(blocks.join('\n\n---\n\n'));
            markdown.isTrusted = false;
            return new vscode.Hover(markdown);
        },
    };
    function startAutoSync() {
        if (!config().get('autoSync', false))
            return;
        const lastSync = context.globalState.get(LAST_SYNC_KEY, 0);
        const interval = intervalHours() * 3600 * 1000;
        const sync = () => void exclusive('sync', () => runSync(true));
        if (Date.now() - lastSync >= interval)
            sync();
        timer = setInterval(sync, interval);
    }
    // Loading the workspace copy is local only; the network is touched by an explicit sync or by autoSync.
    async function initialize() {
        try {
            applyRuleset(await (0, ruleset_1.readRulesetCache)(cacheDir()));
            rescanOpenDocuments();
            emit();
        }
        catch {
            // No usable cache yet.
        }
        startAutoSync();
    }
    const subscriptions = [
        diagnostics,
        vscode.workspace.onDidOpenTextDocument((document) => void scanDocument(document)),
        vscode.workspace.onDidSaveTextDocument((document) => void scanDocument(document)),
    ];
    const panel = {
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
            if (timer)
                clearInterval(timer);
            listeners.clear();
            subscriptions.forEach((item) => item.dispose());
        },
    };
}
module.exports = { createSecurityRulesController };
