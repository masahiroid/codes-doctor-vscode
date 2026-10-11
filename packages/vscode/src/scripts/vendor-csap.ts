#!/usr/bin/env node
/**
 * Copies the CSAP core's compiled output (dist/) into this extension as
 * vendor/csap/, so the extension can call the analysis pipeline directly
 * (no HTTP server, no puppeteer/express/multer — see README for why).
 *
 * This extension lives in its own repo, separate from the CSAP (Code Doctor
 * server/engine) repo. Point CSAP_ROOT at a local checkout of that repo
 * (built with `npm run build` so dist/ exists):
 *
 *   CSAP_ROOT=/path/to/csap-main node scripts/vendor-csap.js
 *   # or: CSAP_ROOT=/path/to/csap-main npm run vendor:csap
 *
 * Defaults to a `csap-main` checkout next to this extension's repo root
 * (i.e. ../csap-main) if CSAP_ROOT is not set.
 */
const fs = require('node:fs');
const path = require('node:path');

const EXTENSION_ROOT = path.join(__dirname, '..');
const CSAP_ROOT = process.env.CSAP_ROOT
  ? path.resolve(process.env.CSAP_ROOT)
  : path.join(EXTENSION_ROOT, '..', 'csap-main');
const SOURCE_DIST = path.join(CSAP_ROOT, 'dist');
const { localizeEngineSource } = require('../lib/localizeEngine');
const { patchEngineSource } = require('../lib/enginePatches');
const DEST_ENGLISH = path.join(EXTENSION_ROOT, 'vendor', 'csap-en');
const DEST_VENDOR = path.join(EXTENSION_ROOT, 'vendor', 'csap');

function assertCsapBuilt() {
  if (!fs.existsSync(SOURCE_DIST) || !fs.existsSync(path.join(SOURCE_DIST, 'services', 'pathAnalysis.js'))) {
    console.error(`[vendor-csap] CSAP dist/ not found or incomplete at: ${SOURCE_DIST}`);
    console.error('[vendor-csap] Set CSAP_ROOT to your csap-main checkout and run "npm run build" there first.');
    process.exit(1);
  }
}

function copyRecursive(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  if (src.endsWith('.js')) {
    fs.writeFileSync(dest, patchEngineSource(fs.readFileSync(src, 'utf-8'), path.relative(SOURCE_DIST, src).split(path.sep).join('/')));
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyEnglish(src: string, dest: string) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) copyEnglish(path.join(src, entry), path.join(dest, entry));
  } else if (src.endsWith('.js') && /^(report|analyzer|graph|llm)\//.test(path.relative(SOURCE_DIST, src).split(path.sep).join('/'))) {
    fs.writeFileSync(dest, localizeEngineSource(patchEngineSource(fs.readFileSync(src, 'utf-8'), path.relative(SOURCE_DIST, src).split(path.sep).join('/')), src));
  } else if (src.endsWith('.js')) {
    fs.writeFileSync(dest, patchEngineSource(fs.readFileSync(src, 'utf-8'), path.relative(SOURCE_DIST, src).split(path.sep).join('/')));
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  assertCsapBuilt();

  if (fs.existsSync(DEST_VENDOR)) {
    fs.rmSync(DEST_VENDOR, { recursive: true, force: true });
  }

  copyRecursive(SOURCE_DIST, DEST_VENDOR);
  if (fs.existsSync(DEST_ENGLISH)) fs.rmSync(DEST_ENGLISH, { recursive: true, force: true });
  copyEnglish(SOURCE_DIST, DEST_ENGLISH);
  console.log(`[vendor-csap] Copied ${SOURCE_DIST} -> ${DEST_VENDOR}`);
}

main();

export {};
