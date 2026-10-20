const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listFilesByExtension } = require('../dist/fileWalker');
const { astSection } = require('../dist/report/sections/astSection');

test('fileWalker: ignores .d.ts, .min.js, lib with sibling src, and nested .gitignore with ** patterns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-walker-test-'));
  try {
    // Root structure
    fs.writeFileSync(path.join(dir, '.gitignore'), '**/ignored-glob\nnode_modules\n');
    
    // Normal files
    fs.writeFileSync(path.join(dir, 'index.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(dir, 'types.d.ts'), 'export declare const a: number;');
    fs.writeFileSync(path.join(dir, 'bundle.min.js'), 'console.log(1);');
    fs.writeFileSync(path.join(dir, 'app.bundle.js'), 'console.log(1);');

    // Nested package with its own .gitignore
    const pkgDir = path.join(dir, 'pkg');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(path.join(pkgDir, '.gitignore'), 'sub-ignored.ts\nignored-folder/\n');
    fs.writeFileSync(path.join(pkgDir, 'ok.ts'), 'export const b = 2;');
    fs.writeFileSync(path.join(pkgDir, 'sub-ignored.ts'), 'export const c = 3;');

    const nestedFolder = path.join(pkgDir, 'ignored-folder');
    fs.mkdirSync(nestedFolder, { recursive: true });
    fs.writeFileSync(path.join(nestedFolder, 'inside.ts'), 'export const inside = 4;');

    // Directory matching **/ignored-glob
    const globDir = path.join(dir, 'some', 'deep', 'path', 'ignored-glob');
    fs.mkdirSync(globDir, { recursive: true });
    fs.writeFileSync(path.join(globDir, 'hidden.ts'), 'export const d = 4;');

    // lib directory with sibling src directory (should be excluded)
    const srcDir = path.join(dir, 'module', 'src');
    const libDir = path.join(dir, 'module', 'lib');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(libDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'source.ts'), 'export const src = 5;');
    fs.writeFileSync(path.join(libDir, 'compiled.js'), 'export const compiled = 5;');

    const res = await listFilesByExtension(dir, [
      { id: 'ts', extensions: ['.ts'] },
      { id: 'js', extensions: ['.js'] },
    ]);

    const tsFiles = res.ts.map((p) => path.relative(dir, p).replace(/\\/g, '/'));
    const jsFiles = res.js.map((p) => path.relative(dir, p).replace(/\\/g, '/'));

    // .d.ts must NOT be included
    assert.ok(!tsFiles.includes('types.d.ts'));
    // index.ts must be included
    assert.ok(tsFiles.includes('index.ts'));
    // ok.ts must be included
    assert.ok(tsFiles.includes('pkg/ok.ts'));
    // sub-ignored.ts must NOT be included (nested .gitignore)
    assert.ok(!tsFiles.includes('pkg/sub-ignored.ts'));
    // ignored-folder/inside.ts must NOT be included (nested .gitignore directory)
    assert.ok(!tsFiles.includes('pkg/ignored-folder/inside.ts'));
    // hidden.ts must NOT be included (**/ pattern)
    assert.ok(!tsFiles.includes('some/deep/path/ignored-glob/hidden.ts'));
    // module/src/source.ts must be included
    assert.ok(tsFiles.includes('module/src/source.ts'));
    // module/lib/compiled.js must NOT be included (sibling src exists)
    assert.ok(!jsFiles.includes('module/lib/compiled.js'));
    // min.js and bundle.js must NOT be included
    assert.ok(!jsFiles.includes('bundle.min.js'));
    assert.ok(!jsFiles.includes('app.bundle.js'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('astSection: caps oversized raw AST files to prevent giant HTML reports', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-ast-test-'));
  try {
    // Generate a file larger than 100KB
    const largeFile = path.join(dir, 'large.ts');
    const padding = '// Padding line to exceed 100KB\n'.repeat(4000);
    fs.writeFileSync(largeFile, `export const x = 1;\n${padding}`);

    const result = {
      files: {
        typescript: [{ filePath: largeFile, name: 'large.ts', lines: 4001 }],
        php: [], dart: [], python: [], go: [], swift: [], csharp: [], java: [], kotlin: [], rust: [], cpp: [],
      },
    };

    const html = astSection(result);
    assert.ok(html.includes('ファイルサイズ超過') || html.includes('file size limit exceeded'));
    // Ensure the HTML did not expand to megabytes
    assert.ok(html.length < 50 * 1024);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
