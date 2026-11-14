const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { parseCommand } = require('../lib/options');
const { summarize } = require('../lib/summary');

const BIN = path.join(__dirname, '..', 'bin', 'codes-doctor.js');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-cli-'));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'a.ts'), "import { b } from './b';\nexport class A { run() { return b(); } }\n");
  fs.writeFileSync(path.join(repo, 'b.ts'), "export function b(req: any) { return eval(req.query.code); }\n");
  return { root, repo, out: path.join(root, 'out') };
}

test('parses analyze options and rejects invalid ones', () => {
  const command = parseCommand(['analyze', 'src', '--lang', 'ja', '--min-security', '80', '--json']);
  assert.equal(command.kind, 'analyze');
  assert.equal(command.options.repoPath, path.resolve('src'));
  assert.equal(command.options.reportLanguage, 'ja');
  assert.equal(command.options.minSecurity, 80);
  assert.equal(command.options.json, true);
  assert.equal(parseCommand(['--help']).kind, 'help');
  assert.throws(() => parseCommand(['analyze', '--lang', 'fr']), /--lang/);
  assert.throws(() => parseCommand(['analyze', '--min-debt', '101']), /--min-debt/);
  assert.throws(() => parseCommand(['scan']), /Unknown command/);
});

test('thresholds fail only on scores below the minimum, never on an empty analysis', () => {
  const result = (files) => ({
    summary: { totalFiles: files },
    technicalDebt: { overallScore: 70, grade: 'C' },
    securityScore: { overallScore: 90, grade: 'A', summary: { critical: 0, high: 1 } },
    godClasses: [],
    circularDependencies: [],
  });
  assert.deepEqual(summarize(result(3), 'r.html', { minSecurity: 90, minTechnicalDebt: 80 }).failures, ['technical debt 70 < 80']);
  const empty = summarize(result(0), 'r.html', { minSecurity: 100, minTechnicalDebt: 100 });
  assert.equal(empty.technicalDebt, undefined);
  assert.deepEqual(empty.failures, []);
});

test('--fail-on counts code and dependency findings at or above the severity', () => {
  const result = (dependencies) => ({
    summary: { totalFiles: 1 },
    securityScore: { overallScore: 90, grade: 'A', summary: { critical: 0, high: 1, medium: 2, low: 0 } },
    vulnerabilityScan: dependencies,
    godClasses: [],
    circularDependencies: [],
  });
  const clean = { critical: 0, high: 0, moderate: 0, low: 0 };
  assert.deepEqual(summarize(result(clean), 'r', { failOn: 'critical' }).failures, []);
  assert.deepEqual(summarize(result(clean), 'r', { failOn: 'high' }).failures, ['findings at high or worse: high 1']);
  assert.deepEqual(summarize(result({ ...clean, critical: 2, moderate: 1 }), 'r', { failOn: 'medium' }).failures, ['findings at medium or worse: medium 3, high 1, critical 2']);
  assert.throws(() => parseCommand(['analyze', '--fail-on', 'severe']), /--fail-on/);
});

test('an unfinished dependency scan fails --fail-on unless explicitly allowed', () => {
  const result = (dependencies) => ({
    summary: { totalFiles: 1 },
    securityScore: { overallScore: 100, grade: 'A', summary: { critical: 0, high: 0, medium: 0, low: 0 } },
    vulnerabilityScan: dependencies,
    godClasses: [],
    circularDependencies: [],
  });
  const unfinished = { critical: 0, high: 0, moderate: 0, low: 0, incomplete: true, summary: 'npm audit failed' };
  assert.deepEqual(summarize(result(unfinished), 'r', { failOn: 'critical' }).failures, ['dependency scan did not finish: npm audit failed']);
  assert.deepEqual(summarize(result(unfinished), 'r', { failOn: 'critical', allowIncompleteScan: true }).failures, []);
  assert.deepEqual(summarize(result(unfinished), 'r', {}).failures, []);
  assert.equal(summarize(result(undefined), 'r', { failOn: 'critical' }).failures.length, 1);
});

test('--fail-on reports a real missing lockfile through the exit code', () => {
  const { root, repo, out } = fixture();
  try {
    fs.writeFileSync(path.join(repo, 'b.ts'), 'export const b = 1;\n');
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
    const failed = spawnSync('node', [BIN, 'analyze', repo, '--out', out, '--fail-on', 'critical'], { encoding: 'utf8' });
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.match(failed.stdout, /FAILED: dependency scan did not finish/);
    const allowed = spawnSync('node', [BIN, 'analyze', repo, '--out', out, '--fail-on', 'critical', '--allow-incomplete-scan'], { encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('analyzes a folder end to end and reports through the exit code', () => {
  const { root, repo, out } = fixture();
  try {
    const summary = JSON.parse(execFileSync('node', [BIN, 'analyze', repo, '--out', out, '--json'], { encoding: 'utf8' }));
    assert.equal(summary.analyzedFiles, 2);
    assert.ok(summary.security.critical > 0, 'eval of request input should be reported');
    const html = fs.readFileSync(summary.reportPath, 'utf8');
    assert.match(html, /<html lang="en">/);
    assert.match(html, /data-report-library="chart"/);
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);

    const failed = spawnSync('node', [BIN, 'analyze', repo, '--out', out, '--min-security', '100'], { encoding: 'utf8' });
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /FAILED: security/);

    const japanese = spawnSync('node', [BIN, 'analyze', repo, '--out', out, '--lang', 'ja', '--json'], { encoding: 'utf8' });
    assert.match(fs.readFileSync(JSON.parse(japanese.stdout).reportPath, 'utf8'), /<html lang="ja">/);

    assert.equal(spawnSync('node', [BIN, 'analyze', path.join(root, 'missing')]).status, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** A local rules manifest (file: URL) with one data-flow rule and one manual rule. */
function rulesFixture(dir, { version = '1', message = 'm', fixStatus } = {}) {
  const crypto = require('node:crypto');
  fs.mkdirSync(dir, { recursive: true });
  const base = { category: 'Emergency / test', severity: 'error', target_languages: ['typescript', 'javascript'], source_urls: ['https://example.com/a'], check_steps: ['check'], excel_mapping: { column: 'SQL', action_required: '要対応' } };
  const pack = {
    id: 'em', version, rules: [
      { ...base, id: 'SQLI', title: 'SQL injection', message, detect: { type: 'taint', languages: ['typescript', 'javascript'], sinks: [{ builtin: 'SQL Injection' }] }, ...(fixStatus ? { fix_status: fixStatus } : {}) },
      { ...base, id: 'LOGS', title: 'Log review', message: 'm' },
    ],
  };
  const bytes = Buffer.from(JSON.stringify(pack));
  fs.writeFileSync(path.join(dir, 'em.json'), bytes);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version, description: '', packs: [{ id: 'em', version, channel: 'emergency', mandatory: true, file: 'em.json', sha256: crypto.createHash('sha256').update(bytes).digest('hex') }] }));
  return `file://${path.join(dir, 'manifest.json')}`;
}

test('parses audit options and keeps analyze and audit options apart', () => {
  const command = parseCommand(['audit', 'src', '--channel', 'emergency,baseline', '--format', 'csv', '--evidence', 'e.json', '--target', 'svc/prod', '--check']);
  assert.equal(command.kind, 'audit');
  assert.deepEqual(command.options.channels, ['emergency', 'baseline']);
  assert.deepEqual(command.options.formats, ['csv']);
  assert.equal(command.options.evidencePath, path.resolve('e.json'));
  assert.deepEqual(parseCommand(['audit']).options.formats, ['json', 'csv', 'xlsx']);
  assert.throws(() => parseCommand(['audit', '--channel', 'urgent']), /--channel/);
  assert.throws(() => parseCommand(['audit', '--format', 'pdf']), /--format/);
  assert.throws(() => parseCommand(['audit', '--evidence', 'e.json']), /--target/);
  assert.throws(() => parseCommand(['audit', '--check']), /--check needs/);
  assert.throws(() => parseCommand(['audit', '--fail-on', 'high']), /not an option of audit/);
  assert.throws(() => parseCommand(['analyze', '--check']), /not an option of analyze/);
});

test('audits a folder with distributed rules: reports, evidence, check, findings and rule updates', () => {
  const { root, repo } = fixture();
  fs.writeFileSync(path.join(repo, 'app.js'), "app.get('/u', (req, res) => { db.query('SELECT * FROM u WHERE id=' + req.query.id); });\n");
  const out = path.join(root, 'audit');
  const evidence = path.join(root, 'evidence.json');
  const cache = path.join(root, 'cache');
  const rules = rulesFixture(path.join(root, 'rules'));
  const run = (...extra) => spawnSync('node', [BIN, 'audit', repo, '--rules', rules, '--rules-cache', cache, '--out', out, ...extra], { encoding: 'utf8' });
  try {
    const first = run('--evidence', evidence, '--target', 'svc/prod', '--json');
    assert.equal(first.status, 0, first.stderr);
    const summary = JSON.parse(first.stdout);
    assert.equal(summary.findings, 1);
    assert.deepEqual(summary.statuses, { flow_detected: 1, manual_check_required: 1 });
    assert.equal(summary.rulesetChanges, undefined, 'nothing to compare on the first download');
    assert.deepEqual(summary.evidence && [summary.evidence.added, summary.evidence.invalidated], [2, 0]);
    for (const name of ['security-audit.json', 'security-audit.csv', 'security-audit-sheet.csv', 'security-audit.xlsx']) {
      assert.ok(fs.existsSync(path.join(out, name)), name);
    }
    assert.match(fs.readFileSync(path.join(out, 'security-audit-sheet.csv'), 'utf8'), /^﻿Classification,/);
    const written = JSON.parse(fs.readFileSync(evidence, 'utf8'));
    assert.equal(written.target, 'svc/prod');
    assert.deepEqual(written.results.map((entry) => [entry.rule_id, entry.status, entry.analysis.status]), [['SQLI', 'pending', 'flow_detected'], ['LOGS', 'pending', 'manual_check_required']]);

    const pending = run('--evidence', evidence, '--target', 'svc/prod', '--check');
    assert.equal(pending.status, 1);
    assert.match(pending.stdout, /em\/SQLI: review incomplete \(pending\)/);

    const checkedAt = new Date(Date.now() - 3600 * 1000).toISOString();
    for (const entry of written.results) Object.assign(entry, { status: 'pass', reviewer: 'r', evidence: ['ticket/1'], checked_at: checkedAt });
    fs.writeFileSync(evidence, JSON.stringify(written));
    const passed = run('--evidence', evidence, '--target', 'svc/prod', '--check');
    assert.equal(passed.status, 0, passed.stdout);
    assert.match(passed.stdout, /Evidence check: passed/);
    assert.match(passed.stdout, /em\/SQLI: marked pass, but the analysis found 1/);
    assert.equal(run('--evidence', evidence, '--target', 'other/prod', '--check').status, 1);
    assert.equal(run('--fail-on-findings', '--format', 'json').status, 1);

    // The rule is updated and its fix released: the change is reported and the review starts over.
    rulesFixture(path.join(root, 'rules'), { version: '2', message: 'updated', fixStatus: 'released' });
    const updated = run('--evidence', evidence, '--target', 'svc/prod');
    assert.equal(updated.status, 0, updated.stderr);
    assert.match(updated.stdout, /! fix released: em\/SQLI SQL injection/);
    assert.match(updated.stdout, /~ pack em 1 -> 2/);
    const after = JSON.parse(fs.readFileSync(evidence, 'utf8'));
    assert.deepEqual(after.results.map((entry) => entry.status), ['pending', 'pending']);
    assert.equal(after.results[0].superseded.status, 'pass');

    assert.equal(run('--offline', '--rules-cache', path.join(root, 'empty')).status, 2);
    assert.equal(run('--pack', 'nope').status, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
