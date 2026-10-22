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

function compiled() {
  const pack = {
    id: 'p', version: '1', description: '', channel: 'emergency', mandatory: true, sha256: '',
    rules: [{
      id: 'SQLI', title: 'SQLi', category: 'c', message: 'm', severity: 'error', targetLanguages: ['typescript', 'javascript'],
      sourceUrls: [], checkSteps: [], excelColumn: 'SQL', actionRequired: '要対応',
      detect: { type: 'taint', languages: ['typescript', 'php'], sinks: [{ builtin: 'SQL Injection' }] },
    }],
  };
  return rules.compileRules([pack], engine).compiled;
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
