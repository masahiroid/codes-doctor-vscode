const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const LANGUAGE_IDS = ['typescript', 'php', 'dart', 'python', 'go', 'swift', 'csharp', 'java', 'kotlin', 'rust', 'cpp'];
const languageFiles = overrides => Object.fromEntries(LANGUAGE_IDS.map(id => [id, overrides[id] ?? []]));

for (const folder of ['csap', 'csap-en']) {
  test(`${folder}: security severity cannot disappear in a large project`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-security-'));
    try {
      const clean = path.join(root, 'clean.js');
      const issue = path.join(root, 'issue.js');
      fs.writeFileSync(clean, 'const value = 1;');
      const files = [{ filePath: issue }, ...Array.from({ length: 200 }, () => ({ filePath: clean }))];
      const { calculateSecurityScore } = require(`../vendor/${folder}/analyzer/securityScore`);
      for (const [code, severity, cap, grade] of [
        ['eval(input)', 'critical', 59, 'F'],
        ['node.innerHTML = input', 'high', 79, 'C'],
        ['document.write(input)', 'medium', 89, 'B'],
        ['const value = process.env.VALUE;', 'info', 99, 'A'],
      ]) {
        fs.writeFileSync(issue, code);
        const result = await calculateSecurityScore([{ language: 'typescript', files }], root);
        assert.equal(result.summary[severity], 1);
        assert.equal(result.overallScore, cap);
        assert.equal(result.grade, grade);
        assert.doesNotMatch(result.explanation, /軽微|minor/);
        if (severity === 'critical') assert.match(result.explanation, /Critical: 1/);
      }
      const cleanResult = await calculateSecurityScore([{ language: 'typescript', files: [{ filePath: clean }] }], root);
      assert.equal(cleanResult.overallScore, 100);
      assert.equal(cleanResult.issues.length, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test(`${folder}: AST structure is available without an LLM review`, () => {
    const { astSection } = require(`../vendor/${folder}/report/sections/astSection`);
    const result = { files: languageFiles({ typescript: [{ filePath: path.join(__dirname, '..', 'extension.js') }] }) };
    const html = astSection(result);
    assert.doesNotMatch(html, /未実行|Not run yet|Run LLM Review/);
    assert.match(html, /activate\(\)/);
    assert.match(html, /<div id="astReview" hidden>/);
    if (folder === 'csap') {
      assert.match(html, /<h2>AST構造<\/h2>/);
      assert.doesNotMatch(html, /AST Structure|AST Raw Data|>Notes<|  Functions \(/);
    } else assert.match(html, /<h2>AST Structure<\/h2>/);
    assert.match(astSection(result, '**review**'), /data-md="\*\*review\*\*"/);
  });

  test(`${folder}: D3 waits for a visible tab and responds to width changes`, () => {
    const { generateD3VisualizationScript } = require(`../vendor/${folder}/graph/d3/visualizationScript`);
    const graph = { nodes: [{ id: 'Example', name: 'Example', size: 10, group: 'Other' }], links: [] };
    const html = generateD3VisualizationScript(graph);
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
    const container = { clientWidth: 0 };
    let observer, calls = [];
    let chain;
    chain = new Proxy(function() {}, { get: (_, key) => (...args) => { calls.push([key, ...args]); return chain; }, apply: () => chain });
    const d3 = new Proxy({}, { get: (_, key) => (...args) => { calls.push([key, ...args]); return chain; } });
    vm.runInNewContext(script, { document: { getElementById: () => container }, d3, ResizeObserver: class { constructor(callback) { observer = callback; } observe() {} } });
    assert.equal(calls.length, 0, 'hidden tabs must not initialize a zero-width SVG');
    container.clientWidth = 900;
    observer();
    assert.ok(calls.some(([key, name, value]) => key === 'attr' && name === 'width' && value === 900));
    assert.equal(calls.filter(([key, name]) => key === 'append' && name === 'svg').length, 1);
    container.clientWidth = 700;
    observer();
    assert.ok(calls.some(([key, name, value]) => key === 'attr' && name === 'width' && value === 700));
    assert.equal(calls.filter(([key, name]) => key === 'append' && name === 'svg').length, 1);
    vm.runInNewContext(script, { document: { getElementById: () => container } });
    assert.match(container.textContent, folder === 'csap' ? /読み込めませんでした/ : /could not be loaded/);
  });
}

test('AST-specific review updates and reveals its own saved-result element', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-ast-review-'));
  const analysisId = '12345678-1234-4234-8234-123456789abc';
  const htmlPath = path.join(root, `${analysisId}.html`);
  try {
    const { runLlmAnalysis } = require('../lib/analyzer');
    fs.writeFileSync(path.join(root, `${analysisId}.ast-llm-context.json`), '{}');
    for (const folder of ['csap', 'csap-en']) {
      const { getAstOnlyLlmContextPath } = require(`../vendor/${folder}/llm/context`);
      fs.writeFileSync(getAstOnlyLlmContextPath(analysisId, root), '{}');
      const provider = require(`../vendor/${folder}/llm/providers`).getLlmProvider('openai');
      const original = provider.analyzeAstOnly;
      const review = 'AST review completed 日本語 😀 $& $1 $` $\' <tag> & \"';
      provider.analyzeAstOnly = async () => review;
      try {
        fs.writeFileSync(htmlPath, '<div id="llmResult" data-md="">full review</div><div id="astReview" hidden><h3>AST review</h3><div id="astResult" data-md=""></div></div>');
        await runLlmAnalysis({ analysisId, outputDir: root, provider: 'openai', apiKey: 'test-key', astOnlyMode: true, displayLanguage: folder === 'csap' ? 'ja' : 'en' });
        const html = fs.readFileSync(htmlPath, 'utf8');
        const escaped = review.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        assert.ok(html.includes(`data-md="${escaped}"`));
        assert.doesNotMatch(html, /id="astReview" hidden/);
        assert.match(html, /full review/);
      } finally { provider.analyzeAstOnly = original; }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('class graphs explain both empty data and classes without dependency links', () => {
  for (const folder of ['csap', 'csap-en']) {
    const { generateD3DependencyGraphSection } = require(`../vendor/${folder}/report/sections/graphSections`);
    assert.match(generateD3DependencyGraphSection({ files: languageFiles({}) }), folder === 'csap' ? /依存データがありません/ : /No dependency data/);
    const html = generateD3DependencyGraphSection({ files: languageFiles({ typescript: [{ filePath: 'example.js', classes: [{ name: 'Example', methodCount: 1, lineCount: 10, dependencies: [] }] }] }) });
    assert.match(html, folder === 'csap' ? /ノードのみ表示/ : /Showing nodes only/);
  }
});

for (const folder of ['csap', 'csap-en']) {
  test(`${folder}: AST report includes all files, full structures, and incremental display`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-all-ast-'));
    try {
      const tsFiles = Array.from({ length: 45 }, (_, i) => {
        const filePath = path.join(root, `file-${i}.ts`);
        const methods = Array.from({ length: 35 }, (_, j) => `method${j}() { return ${j}; }`).join('\n');
        fs.writeFileSync(filePath, `class Class${i} { ${methods} }`);
        return { filePath };
      });
      const html = require(`../vendor/${folder}/report/sections/astSection`).astSection({ files: languageFiles({ typescript: tsFiles }) });
      for (let i = 0; i < 45; i++) assert.ok(html.includes(`Class${i}`), `Missing file ${i}`);
      assert.match(html, /method34\(\)/);
      assert.doesNotMatch(html, /Sampled|サンプル|読みやすい形式|初回の静的解析|先頭5|構造表示は簡易/);
      assert.match(html, /data-ast-pending/);
      assert.equal((html.match(/<details /g) || []).length, 90);
      const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
      const children = Array.from({ length: 25 }, (_, i) => ({ i }));
      const pending = { get firstElementChild() { return children[0]; }, get childElementCount() { return children.length; } };
      const displayed = [];
      const list = { querySelector: (selector) => selector === '[data-ast-pending]' ? { content: pending } : { appendChild: () => displayed.push(children.shift()) } };
      let callback;
      const button = { addEventListener: (_, fn) => { callback = fn; }, closest: () => list, remove() { this.removed = true; } };
      vm.runInNewContext(script, { document: { querySelectorAll: () => [button] } });
      callback();
      assert.equal(displayed.length, 20);
      assert.match(button.textContent, /5/);
      callback();
      assert.equal(displayed.length, 25);
      assert.equal(button.removed, true);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
