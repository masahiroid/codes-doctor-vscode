const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanWorkspaceFiles } = require('../lib/securityRules/workspaceScan');
const rules = require('../lib/securityRules');
const engine = require('../vendor/csap');

function workspace(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-ws-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  const uri = (file) => ({ fsPath: path.join(root, file), toString: () => `file://${path.join(root, file)}` });
  const vscode = {
    workspace: {
      findFiles: async (glob) => Object.keys(files)
        .filter((file) => (glob === rules.SCAN_GLOB ? /\.(?:[cm]?[jt]sx?|json|php)$/ : /\.(?:py|go)$/).test(file))
        .map(uri),
    },
  };
  return { root, vscode };
}

function compiledPacks() {
  return [PACK];
}

const PACK = {
  id: 'p', version: '1', description: '', channel: 'emergency', mandatory: true, sha256: '',
  rules: [{
    id: 'SQLI', title: 'SQLi', category: 'c', message: 'm', severity: 'error', targetLanguages: ['typescript', 'javascript'],
    sourceUrls: [], checkSteps: [], excelColumn: 'SQL', actionRequired: '要対応',
    detect: { type: 'taint', languages: ['typescript', 'php'], sinks: [{ builtin: 'SQL Injection' }] },
  }],
};

function compiled() {
  return rules.compileRules([PACK], engine).compiled;
}

const VULNERABLE = "function h(req) {\n  db.query('SELECT * FROM t WHERE id = ' + req.params.id);\n}\n";

test('workspace scan reports findings, excludes test code and counts what it covered', async () => {
  const { root, vscode } = workspace({
    'src/routes.ts': VULNERABLE,
    'src/safe.ts': "db.query('SELECT 1');\n",
    'app/db.php': "<?php\n$pdo->query('SELECT ' . $_GET['id']);\n",
    'test/routes.test.ts': VULNERABLE,
    'tools/report.py': 'print(1)\n',
  });
  try {
    const published = [];
    const scan = await scanWorkspaceFiles(vscode, { root, rules: compiled(), engine, onFindings: (uri, candidates) => published.push([path.relative(root, uri.fsPath), candidates.length]) });
    assert.deepEqual(scan.results.map((r) => r.file).sort(), ['app/db.php', 'src/routes.ts']);
    assert.deepEqual(published.sort(), [['app/db.php', 1], ['src/routes.ts', 1]]);
    assert.equal(scan.tests, 1);
    assert.equal(scan.unsupported, 1);
    assert.deepEqual(scan.filesByLanguage, { typescript: 2, php: 1 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a cancelled workspace scan returns nothing', async () => {
  const { root, vscode } = workspace({ 'src/routes.ts': VULNERABLE });
  try {
    const scan = await scanWorkspaceFiles(vscode, { root, rules: compiled(), engine, onFindings() {}, token: { isCancellationRequested: true } });
    assert.equal(scan, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a flow into another file is reported on the call, with the sink file in the path and the report', async () => {
  const { root, vscode } = workspace({
    'src/db.ts': "export function findUser(id: string) {\n  return db.query('SELECT * FROM users WHERE id = ' + id);\n}\n",
    'src/routes.ts': "import { findUser } from './db';\nfunction h(req) {\n  return findUser(req.params.id);\n}\n",
  });
  try {
    const scan = await scanWorkspaceFiles(vscode, { root, rules: compiled(), engine, onFindings() {} });
    assert.deepEqual(scan.results.map((r) => r.file), ['src/routes.ts']);
    const [candidate] = scan.results[0].candidates;
    assert.equal(candidate.startLine, 2);
    assert.ok(candidate.flow.sink.file.endsWith(path.join('src', 'db.ts')));
    assert.equal(candidate.flow.sink.line, 2);
    const report = rules.buildAuditReport(compiledPacks(), scan.results, [], {
      generatedAt: 'x', toolName: 't', toolVersion: '0', workspace: 'w', rulesetVersion: '1', source: 'cache',
      scannedFiles: scan.scanned, skippedFiles: 0, testFilesExcluded: 0, filesByLanguage: scan.filesByLanguage, unsupportedFiles: 0,
    }, compiled(), engine);
    const [location] = report.rules[0].locations;
    assert.equal(location.file, 'src/routes.ts');
    assert.equal(location.line, 3);
    assert.equal(location.sinkLine, 2);

    // A single file scanned later with the saved summaries still follows the call.
    const routes = fs.readFileSync(path.join(root, 'src/routes.ts'), 'utf8');
    const again = await rules.scanFile(routes, 'typescript', path.join(root, 'src/routes.ts'), compiled(), engine, scan.index);
    assert.equal(again.length, 1);
    assert.equal((await rules.scanFile(routes, 'typescript', path.join(root, 'src/routes.ts'), compiled(), engine)).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('access (BOLA) rules report handlers without an ownership check and list the checked ones', async () => {
  const pack = {
    id: 'p', version: '1', description: '', channel: 'emergency', mandatory: true, sha256: '',
    rules: [{
      id: 'BOLA', title: 'BOLA', category: 'c', message: 'm', severity: 'error', targetLanguages: ['typescript', 'javascript'],
      sourceUrls: [], checkSteps: [], excelColumn: '認可不備', actionRequired: '要対応',
      detect: { type: 'object_access', languages: ['typescript', 'php'] },
    }],
  };
  const { root, vscode } = workspace({
    'src/orders.ts': [
      "router.get('/orders/:id', async (req, res) => res.json(await Order.findById(req.params.id)));",
      "router.get('/mine/:id', async (req, res) => res.json(await Order.findOne({ where: { id: req.params.id, userId: req.user.id } })));",
      "router.get('/addr/:id', async (req, res) => res.json(await Address.findOne({ where: { id: req.params.id, UserId: req.body.UserId } })));",
    ].join('\n'),
  });
  try {
    const { compiled: rulesCompiled } = rules.compileRules([pack], engine);
    const scan = await scanWorkspaceFiles(vscode, { root, rules: rulesCompiled, engine, onFindings() {} });
    assert.equal(scan.results[0].candidates.length, 1);
    assert.equal(scan.results[0].candidates[0].startLine, 0);
    const report = rules.buildAuditReport([pack], scan.results, [], {
      generatedAt: 'x', toolName: 't', toolVersion: '0', workspace: 'w', rulesetVersion: '1', source: 'cache',
      scannedFiles: scan.scanned, skippedFiles: 0, testFilesExcluded: 0, filesByLanguage: scan.filesByLanguage, unsupportedFiles: 0,
    }, rulesCompiled, engine);
    const [rule] = report.rules;
    assert.equal(rule.method, 'access');
    assert.equal(rule.status, 'owner_check_missing');
    assert.deepEqual(rule.endpointSummary, { missing: 1, unverified: 1, checked: 1 });
    assert.deepEqual(rule.endpoints.map((e) => `${e.route}=${e.status}`), ['GET /orders/:id=owner_check_missing', 'GET /mine/:id=owner_checked', 'GET /addr/:id=owner_field_unverified']);
    const csv = rules.auditReportToCsv(report);
    assert.ok(csv.split('\r\n')[0].endsWith('endpoints_missing,endpoints_unverified,endpoints_checked'));
    assert.ok(csv.split('\r\n')[1].endsWith(',1,1,1'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
