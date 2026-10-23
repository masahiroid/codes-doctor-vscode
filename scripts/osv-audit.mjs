#!/usr/bin/env node
// Checks every package in the lockfiles (dev dependencies included) against the OSV database
// (https://osv.dev), which also carries advisories npm audit has not picked up yet.
// Fails on any vulnerability not listed in security/osv-allowlist.json with a reason and an
// expiry date, on an expired allowlist entry, and when OSV cannot be reached.
//
//   node scripts/osv-audit.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCKFILES = ['engine', 'cli', 'vscode'].map((name) => path.join(ROOT, 'packages', name, 'package-lock.json'));
const ALLOWLIST = path.join(ROOT, 'security', 'osv-allowlist.json');
const API = 'https://api.osv.dev/v1';
const BATCH = 1000;

async function post(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`OSV ${url} answered ${response.status}`);
  return response.json();
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`OSV ${url} answered ${response.status}`);
  return response.json();
}

/** name@version of every installed package in a lockfile (links and the root are skipped). */
function lockedPackages(file) {
  const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
  const found = [];
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (!location || entry.link || !entry.version) continue;
    const name = entry.name ?? location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
    found.push({ name, version: entry.version, lockfile: path.relative(ROOT, file) });
  }
  return found;
}

const packages = new Map();
for (const file of LOCKFILES) {
  for (const entry of lockedPackages(file)) {
    const key = `${entry.name}@${entry.version}`;
    const known = packages.get(key);
    if (known) known.lockfiles.add(entry.lockfile);
    else packages.set(key, { name: entry.name, version: entry.version, lockfiles: new Set([entry.lockfile]) });
  }
}

const list = [...packages.values()];
const hits = new Map();
for (let start = 0; start < list.length; start += BATCH) {
  const chunk = list.slice(start, start + BATCH);
  let queries = chunk.map((item) => ({ package: { name: item.name, ecosystem: 'npm' }, version: item.version }));
  let owners = chunk;
  // A result with next_page_token has more vulnerabilities; query those packages again with the token.
  while (queries.length > 0) {
    const { results } = await post(`${API}/querybatch`, { queries });
    const again = [];
    results.forEach((result, index) => {
      for (const vuln of result.vulns ?? []) {
        const item = owners[index];
        const key = `${vuln.id}|${item.name}@${item.version}`;
        hits.set(key, { id: vuln.id, item });
      }
      if (result.next_page_token) again.push({ query: { ...queries[index], page_token: result.next_page_token }, owner: owners[index] });
    });
    queries = again.map((entry) => entry.query);
    owners = again.map((entry) => entry.owner);
  }
}

const allowlist = fs.existsSync(ALLOWLIST) ? JSON.parse(fs.readFileSync(ALLOWLIST, 'utf8')) : [];
const today = new Date().toISOString().slice(0, 10);
let failed = false;
for (const entry of allowlist) {
  if (!entry.id || !entry.package || !entry.reason || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')) {
    console.error(`Invalid allowlist entry (needs id, package, reason and expires YYYY-MM-DD): ${JSON.stringify(entry)}`);
    failed = true;
  } else if (entry.expires < today) {
    console.error(`Expired allowlist entry ${entry.id} for ${entry.package} (expired ${entry.expires}). Re-check it or remove it.`);
    failed = true;
  }
}

for (const { id, item } of [...hits.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const detail = await get(`${API}/vulns/${encodeURIComponent(id)}`);
  if (detail.withdrawn) continue;
  const severity = detail.database_specific?.severity ?? 'unknown severity';
  const allowed = allowlist.find((entry) => entry.id === id && entry.package === `${item.name}@${item.version}` && entry.expires >= today);
  const line = `${id} (${severity}) ${item.name}@${item.version} in ${[...item.lockfiles].join(', ')}: ${detail.summary ?? ''}`;
  if (allowed) {
    console.log(`allowed until ${allowed.expires}: ${line}\n  reason: ${allowed.reason}`);
  } else {
    console.error(`VULNERABLE: ${line}`);
    failed = true;
  }
}

console.log(`Checked ${list.length} packages from ${LOCKFILES.length} lockfiles against OSV.`);
if (failed) process.exit(1);
