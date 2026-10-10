const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
for (const folder of ['csap', 'csap-en']) {
  test(`${folder}: static imports resolve by path, with no external basename collisions`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-deps-'));
    try {
      fs.mkdirSync(path.join(root, 'nested'));
      const sources = { 'entry.js': "const a = require('./config'); function load() { return require('./nested'); } export * from './nested/config.js'; import('node:fs'); require('config');", 'config.js': "require('./entry');", 'nested/index.js': "require('./config');", 'nested/config.js': '' };
      const files = [];
      for (const [name, source] of Object.entries(sources)) {
        const filename = path.join(root, name);
        fs.writeFileSync(filename, source);
        files.push(await require(`../vendor/${folder}/analyzer/typescript/ast`).parseFile(filename));
      }
      assert.deepEqual(files[0].imports.sort(), ['./config', './nested', './nested/config.js', 'config', 'node:fs'].sort());
      const engine = require(`../vendor/${folder}/analyzer/moduleMetrics`);
      const metrics = engine.calculateModuleMetrics(files);
      const metric = name => metrics.find(m => m.filePath === path.join(root, name));
      assert.equal(metric('entry.js').fanOut, 3);
      assert.equal(metric('nested/config.js').fanIn, 2);
      assert.equal(metric('config.js').fanIn, 1);
      const cycles = engine.detectCircularDependencies(files);
      assert.equal(cycles.length, 1);
      assert.equal(cycles[0].length, 2);
      const deps = require(`../vendor/${folder}/llm/context/dependencyGraphContext`).buildDependencyGraphContext(files, [], []);
      assert.equal(deps.totalInternalDeps, 5);
      const heatmap = require(`../vendor/${folder}/analyzer/layerAnalysis`).generateLayerHeatmap(files, [], [], [], [], [], [], [], [], [], root);
      assert.ok(heatmap.layers.every(l => !['Tmp', 'Private', 'Volumes'].includes(l.name)));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
  test(`${folder}: zero percentiles cannot label zero coupling as high`, () => {
    const build = require(`../vendor/${folder}/llm/context/moduleMetricsContext`).buildModuleMetricsContext;
    const context = build([{ moduleName: 'large', filePath: 'large.js', lineCount: 200, fanIn: 0, fanOut: 0, instability: 0, centrality: 0, structuralScore: 40 }]);
    assert.deepEqual(context.sharedFoundationModules, []);
    assert.ok(context.hotspots.every(m => m.reasons.every(r => !/fan|不安定|instability/.test(r))));
  });
}

test('exported TypeScript declarations are measured and type-only imports do not create runtime cycles', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-exports-'));
  try {
    const filename = path.join(root, 'sample.ts');
    fs.writeFileSync(filename, "import type { Dashboard } from './dashboard'; export class Example { run() {} } export function invoke() {} export default class DefaultExample { work() {} }");
    for (const folder of ['csap', 'csap-en']) {
      const file = await require(`../vendor/${folder}/analyzer/typescript/ast`).parseFile(filename);
      assert.deepEqual(file.imports, []);
      assert.deepEqual(file.classes.map(c => c.name), ['Example', 'DefaultExample']);
      assert.deepEqual(file.functions.map(f => f.name), ['invoke']);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
