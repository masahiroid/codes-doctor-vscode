#!/usr/bin/env node
/**
 * Copies the built engine (packages/engine) into a consuming package's vendor/ folder:
 * dist/ -> vendor/csap (Japanese), dist-en/ -> vendor/csap-en (English) and
 * assets/ -> vendor/assets (report browser libraries). The engine is used as built.
 *
 *   node scripts/vendor-engine.mjs <package-dir>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_ROOT = path.join(REPO_ROOT, 'packages', 'engine');
const PACKAGE_ROOT = path.resolve(process.argv[2] ?? '.');
const VENDOR_ROOT = path.join(PACKAGE_ROOT, 'vendor');
/** Engine build output -> vendor folder. */
const COPIES = [
  { from: 'dist', to: 'csap' },
  { from: 'dist-en', to: 'csap-en' },
  { from: 'assets', to: 'assets' },
];

function assertEngineBuilt() {
  const missing = COPIES.filter(({ from }) => !fs.existsSync(path.join(ENGINE_ROOT, from)));
  if (missing.length > 0) {
    console.error(`[vendor-engine] Engine build output missing in ${ENGINE_ROOT}: ${missing.map(({ from }) => from).join(', ')}`);
    console.error('[vendor-engine] Run "npm run build" in packages/engine first.');
    process.exit(1);
  }
}

function main() {
  assertEngineBuilt();
  fs.rmSync(VENDOR_ROOT, { recursive: true, force: true });
  for (const { from, to } of COPIES) {
    fs.cpSync(path.join(ENGINE_ROOT, from), path.join(VENDOR_ROOT, to), { recursive: true });
  }
  console.log(`[vendor-engine] Copied engine build from ${ENGINE_ROOT} -> ${VENDOR_ROOT}`);
}

main();
