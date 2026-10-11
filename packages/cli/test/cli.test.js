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
  fs.writeFileSync(path.join(repo, 'b.ts'), "export function b() { return eval('1'); }\n");
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

test('analyzes a folder end to end and reports through the exit code', () => {
  const { root, repo, out } = fixture();
  try {
    const summary = JSON.parse(execFileSync('node', [BIN, 'analyze', repo, '--out', out, '--json'], { encoding: 'utf8' }));
    assert.equal(summary.analyzedFiles, 2);
    assert.ok(summary.security.critical > 0, 'eval should be reported');
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
