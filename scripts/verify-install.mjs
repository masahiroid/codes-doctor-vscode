#!/usr/bin/env node
// Fails when node_modules does not match package-lock.json, so a VSIX or engine build is never made
// from a stale install (npm writes what it installed to node_modules/.package-lock.json).
//
//   node scripts/verify-install.mjs <package-dir> [<package-dir> ...]
import fs from 'node:fs';
import path from 'node:path';

const dirs = process.argv.slice(2);
if (dirs.length === 0) throw new Error('Pass at least one package directory');

let failed = false;
for (const dir of dirs) {
  const lockPath = path.join(dir, 'package-lock.json');
  const installedPath = path.join(dir, 'node_modules', '.package-lock.json');
  if (!fs.existsSync(installedPath)) {
    console.error(`${dir}: node_modules is missing or was not installed by npm. Run "npm ci" there.`);
    failed = true;
    continue;
  }
  const locked = JSON.parse(fs.readFileSync(lockPath, 'utf8')).packages ?? {};
  const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8')).packages ?? {};
  const problems = [];
  for (const [location, entry] of Object.entries(locked)) {
    if (!location || entry.link) continue;
    const actual = installed[location];
    // Optional platform packages for other systems are legitimately absent.
    if (!actual) {
      if (!entry.optional) problems.push(`${location} is not installed (lockfile: ${entry.version})`);
    } else if (actual.version !== entry.version || (entry.integrity && actual.integrity !== entry.integrity)) {
      problems.push(`${location} is ${actual.version}, lockfile says ${entry.version}`);
    }
  }
  for (const location of Object.keys(installed)) {
    if (location && !locked[location]) problems.push(`${location} is installed but not in the lockfile`);
  }
  if (problems.length > 0) {
    failed = true;
    console.error(`${dir}: node_modules does not match package-lock.json. Run "npm ci" there.`);
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
  }
}
if (failed) process.exit(1);
