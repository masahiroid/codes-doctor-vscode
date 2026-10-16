#!/usr/bin/env node
// Bumps the patch version of every package (package.json and both version fields of
// package-lock.json) and adds a CHANGELOG entry. Used by the release workflow after
// dependency updates; prints the new version.
//
//   node scripts/bump-version.mjs "<changelog line>" ["<changelog line>" ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['engine', 'cli', 'vscode'].map((name) => path.join(ROOT, 'packages', name));
const CHANGELOG = path.join(ROOT, 'packages', 'vscode', 'CHANGELOG.md');
const CHANGELOG_TITLE = '# Changelog\n';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function nextVersion(version, mode) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (mode === 'major') return `${major + 1}.0.0`;
  if (mode === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const rawArgs = process.argv.slice(2).filter(Boolean);
let mode = 'patch';
const lines = [];
for (const arg of rawArgs) {
  if (arg === '--major') mode = 'major';
  else if (arg === '--minor') mode = 'minor';
  else if (arg === '--patch') mode = 'patch';
  else lines.push(arg);
}
if (lines.length === 0) throw new Error('At least one changelog line is required');

const current = readJson(path.join(ROOT, 'packages', 'vscode', 'package.json')).version;
const next = nextVersion(current, mode);

for (const dir of PACKAGES) {
  const manifestPath = path.join(dir, 'package.json');
  const manifest = readJson(manifestPath);
  manifest.version = next;
  writeJson(manifestPath, manifest);
  const lockPath = path.join(dir, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    lock.version = next;
    if (lock.packages?.['']) lock.packages[''].version = next;
    writeJson(lockPath, lock);
  }
}

const changelog = fs.readFileSync(CHANGELOG, 'utf8');
if (!changelog.startsWith(CHANGELOG_TITLE)) throw new Error('CHANGELOG.md must start with "# Changelog"');
const entry = `\n## ${next}\n\n${lines.map((line) => `- ${line}`).join('\n')}\n`;
fs.writeFileSync(CHANGELOG, CHANGELOG_TITLE + entry + changelog.slice(CHANGELOG_TITLE.length));

process.stdout.write(next + '\n');
