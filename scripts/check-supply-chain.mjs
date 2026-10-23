#!/usr/bin/env node
// For each package: every installed dependency has a valid npm registry signature, and every
// dependency with an install script has been explicitly allowed or denied ("allowScripts" in
// package.json). npm reports unreviewed scripts without failing, so this check fails instead.
//
//   node scripts/check-supply-chain.mjs
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let failed = false;
for (const name of ['engine', 'cli', 'vscode']) {
  const cwd = path.join(ROOT, 'packages', name);
  try {
    execFileSync(npm, ['audit', 'signatures'], { cwd, stdio: 'inherit' });
  } catch {
    console.error(`packages/${name}: registry signature verification failed.`);
    failed = true;
  }
  const pending = JSON.parse(execFileSync(npm, ['install-scripts', 'ls', '--json'], { cwd, encoding: 'utf8' })).allowScripts ?? [];
  if (pending.length > 0) {
    console.error(`packages/${name}: install scripts not yet allowed or denied in package.json: ${pending.map((entry) => entry.name).join(', ')}`);
    failed = true;
  }
}
if (failed) process.exit(1);
