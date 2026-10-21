const test = require('node:test');
const assert = require('node:assert/strict');
const { createDashboardController } = require('../lib/dashboard/controller');

function makeVsCode(language = 'en') {
  return {
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => (key === 'displayLanguage' ? language : fallback), inspect: () => ({ globalValue: language }) }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
    },
  };
}

function makePanel(state) {
  const calls = [];
  return {
    calls,
    getState: () => state,
    onDidChange: () => ({ dispose() {} }),
    setPackEnabled: async (...args) => calls.push(['pack', ...args]),
    openLocation: async (...args) => calls.push(['open', ...args]),
  };
}

const loaded = {
  busy: null, loaded: true, source: 'cache', rulesetVersion: '2.0.0', syncedAt: 0, invalidRuleCount: 0,
  packs: [{ id: 'nict-a2b-2026-10', version: '2.0.0', channel: 'emergency', mandatory: true, ruleCount: 7, enabled: true }],
  scan: {
    at: 0, scannedFiles: 3, skippedFiles: 0, testFilesExcluded: 2, unsupportedFiles: 4, filesByLanguage: { typescript: 2, php: 1 },
    rules: [
      { ruleId: 'EMERG-SQLI', title: 'SQLi', severity: 'error', method: 'dataflow', status: 'flow_detected', excelColumn: 'SQL', actionRequired: '要対応', candidateCount: 1, locations: [{ file: 'src/db.php', line: 9, sourceLine: 3 }], checkSteps: [] },
      { ruleId: 'EMERG-SSRF', title: 'SSRF', severity: 'error', method: 'dataflow', status: 'no_flow_detected', excelColumn: 'SSRF', actionRequired: '要対応', candidateCount: 0, locations: [], checkSteps: [] },
      { ruleId: 'EMERG-BOLA', title: '<b>BOLA</b>', severity: 'error', method: 'pattern', status: 'review_required', excelColumn: '認可不備', actionRequired: '要対応', candidateCount: 1, locations: [{ file: 'src/a.ts', line: 4 }], checkSteps: ['step one'] },
      { ruleId: 'EMERG-LOG', title: 'Logs', severity: 'error', method: 'manual', status: 'manual_check_required', excelColumn: 'ログ', actionRequired: '要対応', candidateCount: 0, locations: [], checkSteps: [] },
    ],
  },
};

test('panel is absent without a security rules service', () => {
  const html = createDashboardController(makeVsCode(), { globalStorageUri: { fsPath: '/nonexistent' } }).buildHtml();
  assert.ok(!html.includes('data-section="security"'));
  assert.ok(html.includes('data-section="ai"'));
});

test('panel lists packs and scan results, escapes rule text and never implies compliance', () => {
  const panel = makePanel(loaded);
  const html = createDashboardController(makeVsCode('ja'), { globalStorageUri: { fsPath: '/nonexistent' } }, () => {}, panel).buildHtml();
  assert.match(html, /data-security-pack="nict-a2b-2026-10" checked/);
  assert.match(html, /data-security-file="src\/a.ts" data-security-line="4"/);
  assert.ok(html.includes('&lt;b&gt;BOLA&lt;/b&gt;'));
  assert.ok(!html.includes('<b>BOLA</b>'));
  assert.match(html, /手動確認/);
  assert.match(html, /安全の証明ではありません/);
  assert.match(html, /入力到達 1件/);
  assert.match(html, /到達なし/);
  assert.match(html, /L3 → 9/);
  assert.match(html, /TypeScript 2 · PHP 1/);
  assert.match(html, /4件は、セキュリティルールが未対応/);
  assert.ok(html.includes('data-command="codeDoctor.scanSecurityRules"'));
});

test('buttons are disabled while a task runs', () => {
  const html = createDashboardController(makeVsCode(), { globalStorageUri: { fsPath: '/nonexistent' } }, () => {}, makePanel({ ...loaded, busy: 'scan' })).buildHtml();
  assert.match(html, /data-command="codeDoctor.scanSecurityRules" disabled>⏳ Scanning…/);
  assert.match(html, /data-security-pack="nict-a2b-2026-10" checked disabled/);
});

test('dashboard messages are validated before reaching the service', async () => {
  const panel = makePanel(loaded);
  const controller = createDashboardController(makeVsCode(), { globalStorageUri: { fsPath: '/nonexistent' } }, () => {}, panel);
  await controller.handleMessage({ type: 'toggleSecurityPack', packId: 'p', enabled: false });
  await controller.handleMessage({ type: 'toggleSecurityPack', packId: 'p', enabled: 'no' });
  await controller.handleMessage({ type: 'openSecurityLocation', file: 'src/a.ts', line: 4 });
  await controller.handleMessage({ type: 'openSecurityLocation', file: 'src/a.ts', line: '4' });
  assert.deepEqual(panel.calls, [['pack', 'p', false], ['open', 'src/a.ts', 4]]);
});
