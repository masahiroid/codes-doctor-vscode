// Bundles the extension for the VSIX into dist/:
//   extension.js            the extension (compiled tsc output), with `vscode` external
//   engine-ja.js / -en.js   the vendored engine for each report language, parsers included
//   node_modules/typescript the TypeScript compiler, shared by both engine bundles
//   assets/, styles.css     files read at runtime relative to the bundles
// Run `npm run vendor:csap && npm run build` first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const require = createRequire(path.join(ROOT, 'package.json'));
/** Too large to include in both engine bundles; shipped once and resolved at runtime. */
const SHARED_EXTERNAL = 'typescript';

const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node20', minify: true, legalComments: 'eof', logLevel: 'warning' };

fs.rmSync(DIST, { recursive: true, force: true });

await build({
  ...common,
  entryPoints: [path.join(ROOT, 'extension.js')],
  outfile: path.join(DIST, 'extension.js'),
  external: ['vscode'],
  define: { CODE_DOCTOR_BUNDLED: 'true' },
});

for (const [language, folder] of [['ja', 'csap'], ['en', 'csap-en']]) {
  await build({
    ...common,
    entryPoints: [path.join(ROOT, 'vendor', folder, 'index.js')],
    outfile: path.join(DIST, `engine-${language}.js`),
    external: [SHARED_EXTERNAL],
  });
}

const typescriptRoot = path.dirname(require.resolve(`${SHARED_EXTERNAL}/package.json`));
const typescriptMain = JSON.parse(fs.readFileSync(path.join(typescriptRoot, 'package.json'), 'utf8')).main;
const typescriptTarget = path.join(DIST, 'node_modules', SHARED_EXTERNAL);
fs.mkdirSync(path.dirname(path.join(typescriptTarget, typescriptMain)), { recursive: true });
fs.copyFileSync(path.join(typescriptRoot, 'package.json'), path.join(typescriptTarget, 'package.json'));
fs.copyFileSync(path.join(typescriptRoot, typescriptMain), path.join(typescriptTarget, typescriptMain));
for (const license of ['LICENSE.txt', 'ThirdPartyNoticeText.txt']) {
  if (fs.existsSync(path.join(typescriptRoot, license))) fs.copyFileSync(path.join(typescriptRoot, license), path.join(typescriptTarget, license));
}

fs.cpSync(path.join(ROOT, 'vendor', 'assets'), path.join(DIST, 'assets'), {
  recursive: true,
  filter: (source) => !source.endsWith('.meta.json'),
});
fs.copyFileSync(path.join(ROOT, 'lib', 'dashboard', 'styles.css'), path.join(DIST, 'styles.css'));

console.log(`[bundle] Wrote ${DIST}`);
