const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const DIST = path.join(__dirname, '..', 'dist');

test('the bundled extension loads without node_modules', () => {
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'vscode') return require.resolve('./fixtures/vscode-stub');
    return resolve.call(this, request, ...rest);
  };
  try {
    const extension = require(path.join(DIST, 'extension.js'));
    assert.equal(typeof extension.activate, 'function');
  } finally {
    Module._resolveFilename = resolve;
  }
});

for (const language of ['ja', 'en']) {
  test(`bundled ${language} engine analyzes TS and PHP and embeds report libraries`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-bundle-'));
    const repo = path.join(root, 'repo');
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, 'a.ts'), "import { b } from './b';\nexport class A { run() { return b(); } }\n");
    fs.writeFileSync(path.join(repo, 'b.ts'), 'export function b() { return 1; }\n');
    fs.writeFileSync(path.join(repo, 'c.php'), '<?php class C { function x() {} }\n');
    fs.writeFileSync(path.join(repo, 'd.go'), 'package d\nimport "os/exec"\ntype D struct{ a int }\nfunc (d *D) Run(x string) { exec.Command("ls"); exec.Command(x) }\n');
    fs.writeFileSync(path.join(repo, 'e.py'), 'class E:\n    def __init__(self):\n        self.a = 1\n');
    const log = console.log;
    console.log = () => {};
    try {
      const engine = require(path.join(DIST, `engine-${language}.js`));
      const { result, reportPath } = await engine.analyzeRepository(repo, 'auto', root, { generatorVersion: 'test' });
      assert.equal(result.summary.totalFiles, 5);
      assert.equal(result.files.php.length, 1);
      // Tree-sitter grammars load from the bundle's node_modules.
      assert.deepEqual(result.files.go[0].classes.map((c) => [c.name, c.methodCount, c.propertyCount]), [['D', 1, 1]]);
      assert.deepEqual(result.files.python[0].classes.map((c) => [c.name, c.propertyCount, c.constructorExists]), [['E', 1, true]]);
      // Only the call with a variable argument is a command-injection candidate.
      assert.equal(result.securityScore.issues.filter((i) => i.category === 'Command Injection').length, 1);
      const html = fs.readFileSync(reportPath, 'utf8');
      assert.match(html, new RegExp(`<html lang="${language}">`));
      assert.equal((html.match(/data-report-library=/g) || []).length, 4);
      assert.doesNotMatch(html, /cdn\.jsdelivr\.net|d3js\.org/);
    } finally {
      console.log = log;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
