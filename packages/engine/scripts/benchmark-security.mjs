#!/usr/bin/env node
// Measures the data-flow analysis on intentionally vulnerable applications pinned to a commit.
// Every finding must be labeled in benchmark/security/expected/<target>.json as a true or false
// positive; known misses are listed there too. The run fails when a true positive disappears
// or an unlabeled finding appears, so a detection change is always reviewed against real code.
//
//   npm run build && node scripts/benchmark-security.mjs [--update] [--cache <dir>]
//
// --update writes unlabeled findings into the expected files as "unreviewed" for labeling.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = path.join(ROOT, 'benchmark', 'security');
const require = createRequire(import.meta.url);
const { analyzeFlows, flowGrammarFor } = require(path.join(ROOT, 'dist', 'analyzer', 'flow', 'taint.js'));
const { isTestPath } = require(path.join(ROOT, 'dist', 'analyzer', 'security', 'testCode.js'));

const args = process.argv.slice(2);
const update = args.includes('--update');
const cacheIndex = args.indexOf('--cache');
const cache = cacheIndex >= 0 ? path.resolve(args[cacheIndex + 1]) : path.join(os.tmpdir(), 'codes-doctor-benchmark');
const config = JSON.parse(fs.readFileSync(path.join(BENCH, 'targets.json'), 'utf8'));
const categories = new Set(config.categories);
const EXTENSIONS = { typescript: /\.(?:[cm]?[jt]sx?)$/, php: /\.php$/ };
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'vendor', 'coverage', 'frontend']);

function checkout(target) {
  const dir = path.join(cache, target.name);
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['remote', 'add', 'origin', target.repository], { cwd: dir });
  }
  const head = (() => {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(); } catch { return ''; }
  })();
  if (head !== target.commit) {
    execFileSync('git', ['fetch', '-q', '--depth', '1', 'origin', target.commit], { cwd: dir });
    execFileSync('git', ['checkout', '-q', '--force', target.commit], { cwd: dir });
  }
  return dir;
}

function* files(dir, root = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, root);
    else yield path.relative(root, full).split(path.sep).join('/');
  }
}

const key = (finding) => `${finding.category}|${finding.file}|${finding.line}`;

let failed = false;
const summary = [];
for (const target of config.targets) {
  const dir = checkout(target);
  const found = [];
  for (const file of files(dir)) {
    if (!EXTENSIONS[target.language].test(file) || isTestPath(file)) continue;
    const grammar = flowGrammarFor(target.language, file);
    if (!grammar) continue;
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.length > 1024 * 1024) continue;
    let flows = [];
    try { flows = await analyzeFlows(grammar, content); } catch { continue; }
    for (const flow of flows) {
      if (categories.has(flow.category)) found.push({ category: flow.category, file, line: flow.sink.line });
    }
  }

  const expectedPath = path.join(BENCH, 'expected', `${target.name}.json`);
  const expected = fs.existsSync(expectedPath) ? JSON.parse(fs.readFileSync(expectedPath, 'utf8')) : { findings: [], misses: [] };
  const labels = new Map(expected.findings.map((f) => [key(f), f]));
  const foundKeys = new Set(found.map(key));
  const tp = expected.findings.filter((f) => f.label === 'tp' && foundKeys.has(key(f)));
  const fp = expected.findings.filter((f) => f.label === 'fp' && foundKeys.has(key(f)));
  const lost = expected.findings.filter((f) => f.label === 'tp' && !foundKeys.has(key(f)));
  const fixedFp = expected.findings.filter((f) => f.label === 'fp' && !foundKeys.has(key(f)));
  const unlabeled = found.filter((f) => !labels.has(key(f)) || labels.get(key(f)).label === 'unreviewed');
  const missesNowFound = (expected.misses ?? []).filter((m) => foundKeys.has(key(m)));

  summary.push({ target: target.name, truePositives: tp.length, falsePositives: fp.length, knownMisses: (expected.misses ?? []).length - missesNowFound.length });
  for (const f of lost) console.error(`[${target.name}] LOST true positive: ${key(f)}${f.note ? ` (${f.note})` : ''}`);
  for (const f of unlabeled) console.error(`[${target.name}] UNLABELED finding: ${key(f)}`);
  for (const f of fixedFp) console.log(`[${target.name}] false positive no longer reported: ${key(f)} — remove it from the expected file`);
  for (const m of missesNowFound) console.log(`[${target.name}] known miss now detected: ${key(m)} — move it to findings as tp`);
  if (lost.length > 0 || unlabeled.length > 0) failed = true;

  if (update && unlabeled.length > 0) {
    const fresh = unlabeled.filter((f) => !labels.has(key(f))).map((f) => ({ ...f, label: 'unreviewed', note: '' }));
    expected.findings = [...expected.findings, ...fresh].sort((a, b) => key(a).localeCompare(key(b)));
    fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
    fs.writeFileSync(expectedPath, JSON.stringify(expected, null, 2) + '\n');
  }
}

console.table(summary);
if (failed) {
  console.error(update ? 'Label the "unreviewed" findings (tp or fp, with a note), then run again.' : 'Benchmark failed. Review the changes above; run with --update to add new findings for labeling.');
  process.exit(1);
}
