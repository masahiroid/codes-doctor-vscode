#!/usr/bin/env node
/**
 * Installs a packed CLI tarball into an empty project with production dependencies only and
 * checks the installed commands, report generation, symlink handling and exit codes.
 *
 *   node scripts/verify-cli-package.mjs <tarball>
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARBALL = path.resolve(process.argv[2] ?? '');
const VERSION = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'packages', 'cli', 'package.json'), 'utf8')).version;
const WINDOWS_CMD = process.platform === 'win32' ? '.cmd' : '';

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codesdoctor-package-'));
  try {
    const project = path.join(root, 'project');
    fs.mkdirSync(project);
    fs.writeFileSync(path.join(project, 'package.json'), '{"private":true}\n');
    execFileSync(`npm${WINDOWS_CMD}`, ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', TARBALL], {
      cwd: project,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    const bin = (name) => path.join(project, 'node_modules', '.bin', name + WINDOWS_CMD);
    const run = (name, ...args) => spawnSync(bin(name), args, { encoding: 'utf8', shell: process.platform === 'win32' });
    assert.equal(run('codesdoctor', '--version').stdout.trim(), VERSION);
    assert.equal(run('codes-doctor', '--version').stdout.trim(), VERSION);

    const target = path.join(root, 'target');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'a.ts'), 'export function a(req: any) { return eval(req.query.code); }\n');
    fs.symlinkSync('.', path.join(target, 'loop'));

    for (const lang of ['en', 'ja']) {
      const out = path.join(root, `report-${lang}`);
      const passed = run('codesdoctor', 'analyze', target, '--out', out, '--lang', lang, '--json');
      assert.equal(passed.status, 0, passed.stderr);
      assert.ok(fs.existsSync(JSON.parse(passed.stdout).reportPath), 'report file was not written');
    }
    const gated = run('codesdoctor', 'analyze', target, '--out', path.join(root, 'report-gated'), '--min-security', '100');
    assert.equal(gated.status, 1, gated.stderr);
    const severity = run('codesdoctor', 'analyze', target, '--out', path.join(root, 'report-severity'), '--fail-on', 'critical');
    assert.equal(severity.status, 1, severity.stderr);
    assert.equal(run('codesdoctor', 'analyze', '--lang', 'fr').status, 2);
    console.log(`[verify-cli-package] codesdoctor@${VERSION} OK`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
