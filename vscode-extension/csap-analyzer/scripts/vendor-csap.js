#!/usr/bin/env node
/**
 * Copies the CSAP core's compiled output (dist/) into this extension as
 * vendor/csap/, so the extension can call the analysis pipeline directly
 * (no HTTP server, no puppeteer/express/multer — see README for why).
 *
 * Run from the CSAP repo root: `node vscode-extension/csap-analyzer/scripts/vendor-csap.js`
 * or via `npm run vendor:csap` inside vscode-extension/csap-analyzer.
 */
const fs = require('node:fs');
const path = require('node:path');

const EXTENSION_ROOT = path.join(__dirname, '..');
const CSAP_ROOT = path.join(EXTENSION_ROOT, '..', '..');
const SOURCE_DIST = path.join(CSAP_ROOT, 'dist');
const DEST_VENDOR = path.join(EXTENSION_ROOT, 'vendor', 'csap');

function assertCsapBuilt() {
  if (!fs.existsSync(SOURCE_DIST) || !fs.existsSync(path.join(SOURCE_DIST, 'services', 'pathAnalysis.js'))) {
    console.error(`[vendor-csap] CSAP dist/ not found or incomplete at: ${SOURCE_DIST}`);
    console.error('[vendor-csap] Run "npm run build" in the CSAP repo root first.');
    process.exit(1);
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

function main() {
  assertCsapBuilt();

  if (fs.existsSync(DEST_VENDOR)) {
    fs.rmSync(DEST_VENDOR, { recursive: true, force: true });
  }

  copyRecursive(SOURCE_DIST, DEST_VENDOR);
  console.log(`[vendor-csap] Copied ${SOURCE_DIST} -> ${DEST_VENDOR}`);
}

main();
