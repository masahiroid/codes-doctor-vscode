const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createSecurityRulesController } = require('../lib/securityRules/controller');
const { sha256Hex } = require('../lib/securityRules');

/** A local rule distribution: one pack with a data-flow rule and a manual rule. */
function ruleset(dir) {
  const pack = JSON.stringify({
    id: 'nict-test', version: '1.0.0', description: 'd', channel: 'emergency', mandatory: true,
    rules: [
      { id: 'EMERG-SQLI', title: 'SQLi', category: 'c', severity: 'error', target_languages: ['typescript', 'javascript'], message: 'm',
        source_urls: ['https://example.test'], check_steps: ['s'], excel_mapping: { column: 'SQL', action_required: '要対応' },
        detect: { type: 'taint', languages: ['typescript'], sinks: [{ builtin: 'SQL Injection' }] } },
      { id: 'EMERG-LOG', title: 'Logs', category: 'c', severity: 'warning', target_languages: ['json'], message: 'm',
        source_urls: ['https://example.test'], check_steps: ['s'], excel_mapping: { column: 'Log', action_required: '要対応' } },
    ],
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'nict-test.json'), pack);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version: '2.0.0', packs: [{ id: 'nict-test', version: '1.0.0', channel: 'emergency', mandatory: true, file: 'nict-test.json', sha256: sha256Hex(pack) }] }));
  return pathToFileURL(path.join(dir, 'manifest.json')).href;
}

function mockVsCode(root, sourceUrl) {
  const log = { status: [], info: [], warning: [], error: [], executed: [] };
  const memento = () => { const map = new Map(); return { get: (key, fallback) => (map.has(key) ? map.get(key) : fallback), update: async (key, value) => void map.set(key, value) }; };
  class Range { constructor(a, b, c, d) { Object.assign(this, { start: { line: a, character: b }, end: { line: c, character: d } }); } contains() { return false; } }
  const diagnostics = new Map();
  const vscode = {
    log,
    diagnostics,
    Range,
    Position: class { constructor(line, character) { Object.assign(this, { line, character }); } },
    Diagnostic: class { constructor(range, message, severity) { Object.assign(this, { range, message, severity }); } },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    Location: class { constructor(uri, range) { Object.assign(this, { uri, range }); } },
    DiagnosticRelatedInformation: class { constructor(location, message) { Object.assign(this, { location, message }); } },
    Uri: { file: (fsPath) => ({ fsPath, scheme: 'file', toString: () => `file://${fsPath}` }) },
    ProgressLocation: { Notification: 15 },
    languages: { createDiagnosticCollection: () => ({ set: (uri, list) => diagnostics.set(uri.fsPath, list), delete: (uri) => diagnostics.delete(uri.fsPath), clear: () => diagnostics.clear(), dispose() {} }) },
    workspace: {
      workspaceFolders: [{ name: 'w', uri: { fsPath: root } }],
      textDocuments: [],
      getConfiguration: () => ({ get: (key, fallback) => (key === 'sourceUrl' ? sourceUrl : fallback), inspect: () => ({}) }),
      onDidOpenTextDocument: () => ({ dispose() {} }),
      onDidSaveTextDocument: () => ({ dispose() {} }),
      findFiles: async (glob) => (/py,go/.test(glob) ? [] : fs.readdirSync(path.join(root, 'src')).map((name) => vscode.Uri.file(path.join(root, 'src', name)))),
    },
    window: {
      setStatusBarMessage: (message) => log.status.push(message),
      showInformationMessage: (message) => { log.info.push(message); return Promise.resolve(undefined); },
      showWarningMessage: (message) => { log.warning.push(message); return Promise.resolve(undefined); },
      showErrorMessage: (message) => { log.error.push(message); return Promise.resolve(undefined); },
      withProgress: async (_options, task) => task({ report() {} }, { isCancellationRequested: false }),
    },
    commands: { executeCommand: async (...args) => log.executed.push(args) },
  };
  const context = { globalStorageUri: { fsPath: path.join(root, '.storage') }, workspaceState: memento(), globalState: memento() };
  return { vscode, context };
}

test('security rules controller: sync, scan, export, and the cached copy when the source fails', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-controller-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'routes.ts'), "function h(req) {\n  db.query('SELECT * FROM t WHERE id = ' + req.params.id);\n}\n");
    const source = ruleset(path.join(root, 'rules'));
    const { vscode, context } = mockVsCode(root, source);
    const controller = createSecurityRulesController(vscode, context);
    await controller.initialize();
    assert.equal(controller.panel.getState().loaded, false);

    await controller.syncRules();
    let state = controller.panel.getState();
    assert.equal(state.loaded, true);
    assert.equal(state.source, 'network');
    assert.deepEqual(vscode.log.status, ['Security rules synced: 1 packs, 2 rules.']);

    await controller.scanSecurityRules();
    state = controller.panel.getState();
    assert.deepEqual(state.scan.rules.map((rule) => `${rule.ruleId}=${rule.status}`), ['EMERG-SQLI=flow_detected', 'EMERG-LOG=manual_check_required']);
    assert.equal(vscode.diagnostics.size, 1);

    await controller.exportReport();
    const directory = path.join(root, '.codes-doctor', 'security-audit');
    const written = fs.readdirSync(directory).sort();
    assert.equal(written.length, 2);
    assert.match(written[0], /^security-audit-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.csv$/);
    assert.equal(written[1], written[0].replace(/\.csv$/, '.json'));
    const report = JSON.parse(fs.readFileSync(path.join(directory, written[1]), 'utf8'));
    assert.equal(report.workspace, path.basename(root));
    assert.equal(report.rulesetVersion, '2.0.0');
    assert.equal(report.rulesSource, source);
    assert.equal(report.source, 'network');
    assert.equal(report.toolName, 'Codes Doctor');
    assert.equal(report.toolVersion, require('../package.json').version);
    assert.equal(report.scannedFiles, 1);
    assert.deepEqual(report.rules.map((rule) => rule.status), ['flow_detected', 'manual_check_required']);
    assert.ok(fs.readFileSync(path.join(directory, written[0]), 'utf8').startsWith('﻿pack_id,'));
    assert.deepEqual(vscode.log.info, ['Security audit report saved to .codes-doctor/security-audit. Items are review candidates, not a compliance verdict.']);

    // The source disappears: the verified copy in the extension's storage is used, with a warning.
    fs.rmSync(path.join(root, 'rules'), { recursive: true, force: true });
    await controller.syncRules();
    state = controller.panel.getState();
    assert.equal(state.source, 'cache');
    assert.equal(vscode.log.warning.length, 1);
    assert.match(state.error, /Using the cached rules/);
    controller.dispose();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
