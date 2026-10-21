const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const rules = require('../lib/securityRules');

const SOURCE = 'https://example.test/dist/manifest.json';

function makeRuleset(overrides = {}) {
  const pack = JSON.stringify({
    id: 'nict-test', version: '1.0.0', description: 'test', channel: 'emergency', mandatory: true, published_at: '2026-10-21',
    rules: [
      {
        id: 'EMERG-BOLA', title: 'BOLA', category: 'Emergency', severity: 'error', target_languages: ['typescript', 'javascript'],
        message: 'check authorization', verification: 'manual', required: true, source_urls: ['https://example.test/a', 'http://insecure.test/b'],
        check_steps: ['step'], excel_mapping: { column: '=認可不備', action_required: '要対応' },
        pattern: "router\\.get\\(\\s*['\"]/api/", pattern_semantics: 'review_candidate',
      },
      {
        id: 'EMERG-MANUAL', title: 'Manual', category: 'Emergency', severity: 'warning', target_languages: ['json'],
        message: 'manual', verification: 'manual', required: true, source_urls: ['https://example.test/c'],
        check_steps: ['step'], excel_mapping: { column: 'ログ確認', action_required: '要対応' },
      },
      {
        id: 'BAD-PY', title: 'Python flag', category: 'x', severity: 'warning', target_languages: ['javascript'], message: 'm',
        source_urls: ['https://example.test/d'], check_steps: ['s'], excel_mapping: { column: 'c', action_required: '要対応' }, pattern: '(?i)select',
      },
      {
        id: 'BAD-REDOS', title: 'ReDoS', category: 'x', severity: 'warning', target_languages: ['javascript'], message: 'm',
        source_urls: ['https://example.test/e'], check_steps: ['s'], excel_mapping: { column: 'c', action_required: '要対応' }, pattern: '(a+)+$',
      },
    ],
    ...overrides,
  });
  const manifest = JSON.stringify({
    version: '2.0.0', description: 'd',
    packs: [{ id: 'nict-test', version: '1.0.0', channel: 'emergency', mandatory: true, file: 'nict-test.json', sha256: rules.sha256Hex(pack) }],
  });
  return { pack, manifest };
}

function fetchFrom(files) {
  return async (url) => {
    const name = url.slice(url.lastIndexOf('/') + 1);
    return name in files
      ? { ok: true, status: 200, url, arrayBuffer: async () => Buffer.from(files[name]) }
      : { ok: false, status: 404, url, arrayBuffer: async () => new ArrayBuffer(0) };
  };
}

test('downloads a ruleset and verifies every pack against the manifest hash', async () => {
  const { pack, manifest } = makeRuleset();
  const ruleset = await rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'nict-test.json': pack }));
  assert.equal(ruleset.packs[0].rules.length, 4);
  assert.deepEqual(ruleset.packs[0].rules[0].sourceUrls, ['https://example.test/a']);
  await assert.rejects(
    rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'nict-test.json': pack.replace('BOLA', 'B0LA') })),
    /Checksum mismatch/
  );
});

test('refuses non-HTTPS sources, redirects to HTTP, and unsafe pack file names', async () => {
  await assert.rejects(rules.downloadRuleset('http://example.test/manifest.json', fetchFrom({})), /neither HTTPS nor file/);
  await assert.rejects(
    rules.fetchBytes(SOURCE, async () => ({ ok: true, status: 200, url: 'http://example.test/x', arrayBuffer: async () => new ArrayBuffer(1) })),
    /redirected/
  );
  const { manifest } = makeRuleset();
  const evil = JSON.parse(manifest);
  evil.packs[0].file = '../escape.json';
  assert.throws(() => rules.parseManifest(JSON.stringify(evil)), /unsafe pack file name/);
});

test('cache round trip works offline and rejects a tampered cache', async () => {
  const { pack, manifest } = makeRuleset();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cd-rules-'));
  try {
    const ruleset = await rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'nict-test.json': pack }));
    await rules.writeRulesetCache(dir, ruleset);
    const cached = await rules.readRulesetCache(dir);
    assert.equal(cached.source, 'cache');
    assert.equal(cached.packs[0].id, 'nict-test');
    await fs.writeFile(path.join(dir, 'nict-test.json'), pack.replace('error', 'warning'));
    await assert.rejects(rules.readRulesetCache(dir), /Checksum mismatch/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('compiles safe patterns and reports unusable ones instead of running them', async () => {
  const { pack, manifest } = makeRuleset();
  const ruleset = await rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'nict-test.json': pack }));
  const { compiled, invalid } = rules.compileRules(ruleset.packs);
  assert.deepEqual(compiled.map((c) => c.rule.id), ['EMERG-BOLA', 'EMERG-MANUAL']);
  assert.deepEqual(invalid.map((i) => i.ruleId).sort(), ['BAD-PY', 'BAD-REDOS']);
});

test('scans by target language and reports zero-based ranges', async () => {
  const { pack, manifest } = makeRuleset();
  const ruleset = await rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'nict-test.json': pack }));
  const { compiled } = rules.compileRules(ruleset.packs);
  const code = "const a = 1;\nrouter.get('/api/users/:id', handler);\nrouter.get(\n  \"/api/x\", h);\n";
  const hits = rules.scanText(code, 'typescript', compiled);
  assert.equal(hits.length, 2);
  assert.deepEqual([hits[0].startLine, hits[0].startColumn], [1, 0]);
  assert.deepEqual([hits[1].startLine, hits[1].endLine], [2, 3]);
  assert.equal(rules.scanText(code, 'json', compiled).length, 0);
  assert.equal(rules.languageForFile('a.ts'), 'typescript');
  assert.equal(rules.languageForFile('a.d.ts'), undefined);
  assert.equal(rules.languageForFile('a.py'), undefined);
});

test('audit report never claims compliance and CSV neutralizes formulas', async () => {
  const { pack, manifest } = makeRuleset();
  const ruleset = await rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'nict-test.json': pack }));
  const { compiled, invalid } = rules.compileRules(ruleset.packs);
  const hits = rules.scanText("router.get('/api/a', h);", 'javascript', compiled);
  const report = rules.buildAuditReport(ruleset.packs, [{ file: 'src/a.js', candidates: hits }], invalid, {
    generatedAt: '2026-10-21T00:00:00.000Z', toolName: 'Codes Doctor', toolVersion: '0', workspace: 'w', rulesetVersion: '2.0.0',
    source: 'network', scannedFiles: 1, skippedFiles: 0,
  });
  assert.equal(report.compliance, 'unverified');
  const bola = report.rules.find((r) => r.ruleId === 'EMERG-BOLA');
  assert.equal(bola.status, 'review_required');
  assert.deepEqual(bola.locations, [{ file: 'src/a.js', line: 1 }]);
  assert.equal(report.rules.find((r) => r.ruleId === 'EMERG-MANUAL').status, 'manual_check_required');
  const csv = rules.auditReportToCsv(report);
  assert.ok(csv.startsWith('﻿pack_id,'));
  assert.ok(csv.includes("'=認可不備"));
  assert.ok(csv.includes('src/a.js:1'));
});

test('escapes Markdown from network rule text', () => {
  assert.equal(rules.escapeMarkdown('[x](https://evil) ![i](u) `c`'), '\\[x\\]\\(https://evil\\) \\!\\[i\\]\\(u\\) \\`c\\`');
});

test('rules with a detector run the engine data-flow analysis and report flows, not pattern hits', async () => {
  const engine = require('../vendor/csap');
  const pack = JSON.stringify({
    id: 'flow-pack', version: '1.0.0', description: 'd', channel: 'emergency', mandatory: true,
    rules: [{
      id: 'EMERG-SQLI', title: 'SQLi', category: 'c', severity: 'error', target_languages: ['typescript', 'javascript'], message: 'm',
      source_urls: ['https://example.test'], check_steps: ['s'], excel_mapping: { column: 'SQL', action_required: '要対応' },
      pattern: 'query', detect: { type: 'taint', languages: ['typescript', 'php'], sinks: [{ builtin: 'SQL Injection' }] },
    }, {
      id: 'EMERG-SSRF', title: 'SSRF', category: 'c', severity: 'error', target_languages: ['typescript'], message: 'm',
      source_urls: ['https://example.test'], check_steps: ['s'], excel_mapping: { column: 'SSRF', action_required: '要対応' },
      detect: { type: 'taint', languages: ['typescript'], sinks: [{ builtin: 'SSRF' }] },
    }],
  });
  const manifest = JSON.stringify({ version: '3.0.0', packs: [{ id: 'flow-pack', version: '1.0.0', channel: 'emergency', mandatory: true, file: 'flow-pack.json', sha256: rules.sha256Hex(pack) }] });
  const ruleset = await rules.downloadRuleset(SOURCE, fetchFrom({ 'manifest.json': manifest, 'flow-pack.json': pack }));
  const { compiled, invalid } = rules.compileRules(ruleset.packs, engine);
  assert.deepEqual(invalid, []);
  const code = "function h(req) {\n  const id = req.params.id;\n  db.query('SELECT 1');\n  db.query('SELECT * FROM t WHERE id = ' + id);\n}\n";
  const hits = await rules.scanFile(code, 'typescript', 'a.ts', compiled, engine);
  assert.deepEqual(hits.map((h) => [h.ruleId, h.startLine, h.flow?.source.line]), [['EMERG-SQLI', 3, 2]]);
  const php = await rules.scanFile("<?php\n$id = $_GET['id'];\n$pdo->query('SELECT ' . $id);\n", 'php', 'a.php', compiled, engine);
  assert.deepEqual(php.map((h) => [h.ruleId, h.startLine]), [['EMERG-SQLI', 2]]);
  const report = rules.buildAuditReport(ruleset.packs, [{ file: 'a.ts', candidates: hits }], invalid, {
    generatedAt: 'x', toolName: 't', toolVersion: '0', workspace: 'w', rulesetVersion: '3.0.0', source: 'cache', scannedFiles: 1, skippedFiles: 0, testFilesExcluded: 0,
    filesByLanguage: { typescript: 1 }, unsupportedFiles: 0,
  }, compiled, engine);
  assert.deepEqual(report.rules.map((r) => [r.ruleId, r.method, r.status]), [['EMERG-SQLI', 'dataflow', 'flow_detected'], ['EMERG-SSRF', 'dataflow', 'no_flow_detected']]);
  assert.equal(report.rules[0].locations[0].sourceLine, 2);
  const pythonOnly = rules.buildAuditReport(ruleset.packs, [], invalid, {
    generatedAt: 'x', toolName: 't', toolVersion: '0', workspace: 'w', rulesetVersion: '3.0.0', source: 'cache', scannedFiles: 0, skippedFiles: 0, testFilesExcluded: 0,
    filesByLanguage: {}, unsupportedFiles: 12,
  }, compiled, engine);
  assert.deepEqual(pythonOnly.rules.map((r) => [r.status, r.analyzedFiles]), [['no_target_files', 0], ['no_target_files', 0]]);
  assert.deepEqual(rules.compileRules(ruleset.packs).invalid.map((i) => i.ruleId), ['EMERG-SQLI', 'EMERG-SSRF']);
});

test('file: URLs read a local ruleset', async () => {
  const { pack, manifest } = makeRuleset();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cd-local-'));
  try {
    await fs.writeFile(path.join(dir, 'manifest.json'), manifest);
    await fs.writeFile(path.join(dir, 'nict-test.json'), pack);
    const ruleset = await rules.downloadRuleset(require('node:url').pathToFileURL(path.join(dir, 'manifest.json')).href);
    assert.equal(ruleset.packs[0].id, 'nict-test');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
