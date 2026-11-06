#!/usr/bin/env node
// Fails unless every package and lock file shares one version and every CHANGELOG has an entry for it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['engine', 'cli', 'vscode'];
const CHANGELOGS = ['CHANGELOG.md', 'CHANGELOG.ja.md', 'packages/vscode/CHANGELOG.md'];

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const expected = readJson('packages/vscode/package.json').version;
const problems = [];

function expectVersion(label, actual) {
  if (actual !== expected) problems.push(`${label} is ${actual}, expected ${expected}`);
}

for (const name of PACKAGES) {
  const dir = `packages/${name}`;
  expectVersion(`${dir}/package.json`, readJson(`${dir}/package.json`).version);
  const lock = readJson(`${dir}/package-lock.json`);
  expectVersion(`${dir}/package-lock.json`, lock.version);
  expectVersion(`${dir}/package-lock.json packages[""]`, lock.packages?.['']?.version);
}

for (const file of CHANGELOGS) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  if (!lines.includes(`## ${expected}`)) problems.push(`${file} has no "## ${expected}" entry`);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`All packages and changelogs are at ${expected}.`);
