#!/usr/bin/env node
// npm audit for every package (development dependencies included, every severity), with the same
// allowlist as the OSV check (security/osv-allowlist.json): an advisory passes only when an entry
// names its GHSA ID and the installed package@version, with a reason and an unexpired date.
// npm audit itself has no allowlist, so a documented exception would otherwise block CI.
//
//   node scripts/npm-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST = path.join(ROOT, 'security', 'osv-allowlist.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const allowlist = fs.existsSync(ALLOWLIST) ? JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')) : [];
const today = new Date().toISOString().slice(0, 10);
let failed = false;

for (const name of ['engine', 'cli', 'vscode']) {
  const cwd = path.join(ROOT, 'packages', name);
  const result = spawnSync(npm, ['audit', '--json'], { cwd, encoding: 'utf8' });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error(`packages/${name}: npm audit did not produce a report.\n${result.stderr}`);
    failed = true;
    continue;
  }
  if (report.error) {
    console.error(`packages/${name}: npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
    failed = true;
    continue;
  }
  const lock = JSON.parse(fs.readFileSync(path.join(cwd, 'package-lock.json'), 'utf8')).packages ?? {};
  for (const [pkg, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    // Entries whose `via` is only other package names inherit an advisory reported on that package.
    for (const advisory of vulnerability.via.filter((via) => typeof via === 'object')) {
      const id = /GHSA-[\w-]+/.exec(advisory.url ?? '')?.[0] ?? String(advisory.source);
      const versions = [...new Set(vulnerability.nodes.map((node) => lock[node]?.version).filter(Boolean))];
      const line = `${id} (${advisory.severity}) ${pkg}@${versions.join(', ')} in packages/${name}: ${advisory.title}`;
      const allowed = versions.length > 0 && versions.every((version) =>
        allowlist.some((entry) => entry.id === id && entry.package === `${pkg}@${version}` && entry.reason && entry.expires >= today));
      if (allowed) {
        console.log(`allowed (security/osv-allowlist.json): ${line}`);
      } else {
        console.error(`VULNERABLE: ${line}`);
        failed = true;
      }
    }
  }
}
if (failed) process.exit(1);
console.log('npm audit: no vulnerabilities outside the allowlist.');
