#!/usr/bin/env node
/**
 * Copies the built engine (packages/engine) into this extension's vendor/ folder so the
 * packaged VSIX carries it: dist/ -> vendor/csap (Japanese), dist-en/ -> vendor/csap-en
 * (English), assets/ -> vendor/assets (report browser libraries). The engine is used as
 * built; nothing is patched here. `npm run vendor:csap` builds the engine first.
 * CSAP_ROOT may point at another engine checkout instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXTENSION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_ROOT = process.env.CSAP_ROOT
  ? path.resolve(process.env.CSAP_ROOT)
  : path.join(EXTENSION_ROOT, '..', 'engine');
const VENDOR_ROOT = path.join(EXTENSION_ROOT, 'vendor');
/** Engine build output -> vendor folder. The two engine builds resolve assets as ../assets. */
const COPIES = [
  { from: 'dist', to: 'csap' },
  { from: 'dist-en', to: 'csap-en' },
  { from: 'assets', to: 'assets' },
];

function assertEngineBuilt() {
  const missing = COPIES.filter(({ from }) => !fs.existsSync(path.join(ENGINE_ROOT, from)));
  if (missing.length > 0) {
    console.error(`[vendor-csap] Engine build output missing in ${ENGINE_ROOT}: ${missing.map(({ from }) => from).join(', ')}`);
    console.error('[vendor-csap] Run "npm run build" in packages/engine (or set CSAP_ROOT) first.');
    process.exit(1);
  }
}

function main() {
  assertEngineBuilt();
  fs.rmSync(VENDOR_ROOT, { recursive: true, force: true });
  for (const { from, to } of COPIES) {
    fs.cpSync(path.join(ENGINE_ROOT, from), path.join(VENDOR_ROOT, to), { recursive: true });
  }
  console.log(`[vendor-csap] Copied engine build from ${ENGINE_ROOT} -> ${VENDOR_ROOT}`);
}

main();
