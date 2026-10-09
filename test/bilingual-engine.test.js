const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { analyzeWorkspace, getReportLanguage, runLlmAnalysis } = require('../lib/analyzer');
const { localizeEngineSource } = require('../lib/localizeEngine');

test('literal localization preserves comments, identifiers, and interpolated data', () => {
  const source = '// 概要\nconst 日本語 = repoName; const html = `<html lang="ja">概要${日本語}</html>`;';
  const result = localizeEngineSource(source, 'fixture.js');
  assert.match(result, /\/\/ 概要/);
  assert.match(result, /const 日本語 = repoName/);
  assert.match(result, /<html lang="en">Overview\$\{日本語\}/);
  assert.throws(() => localizeEngineSource("const text = '未翻訳の文章';", 'fixture.js'), /Missing English report translation/);
  new vm.Script(result);
});

test('real analysis generates English and Japanese reports without changing repository names', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-analysis-'));
  const repo = path.join(root, '日本語リポジトリ');
  const output = path.join(root, 'reports');
  fs.mkdirSync(repo); fs.mkdirSync(output);
  fs.writeFileSync(path.join(repo, 'sample.ts'), 'class Sample { run(input: string) { return eval(input); } }\nclass Worker { work() { return new Sample().run("1"); } }');
  try {
    for (const language of ['en', 'ja']) {
      const result = await analyzeWorkspace(repo, 'typescript', output, language);
      const html = fs.readFileSync(result.reportPath, 'utf8');
      assert.equal(getReportLanguage(result.reportPath), language);
      assert.match(html, /<script id="code-doctor-report-tabs">/);
      assert.ok(html.includes(`data-analysis-id="${result.analysisId}"`));
      assert.ok(html.includes('日本語リポジトリ'));
      assert.match(html, /<h1>Codes Doctor<\/h1>/);
      assert.ok(html.includes(`name="codes-doctor-version" content="${require('../package.json').version}"`));
      assert.match(html, /<title>Codes Doctor — 日本語リポジトリ<\/title>/);
      if (language === 'en') assert.doesNotMatch(html.replaceAll('日本語リポジトリ', ''), /[ぁ-龯]/);
      for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('full and AST review prompts use the report language for both providers', () => {
  const context = { repoName: '日本語リポジトリ', analyzedAt: '2026-10-09', primaryLanguage: 'typescript', astData: Object.fromEntries(['typescript', 'php', 'dart'].map(key => [key, { sampledCount: 0, totalCount: 0 }])) };
  for (const [folder, language] of [['csap', 'Japanese'], ['csap-en', 'English']]) {
    const prompts = require(`../vendor/${folder}/llm/openai/prompts`);
    assert.ok(prompts.buildFullAnalysisPrompt(context, 'graph-metrics').includes(`in ${language}`));
    assert.ok(prompts.buildAstOnlySystemPrompt().includes(`in ${language}`));
    assert.ok(prompts.buildAstOnlyPrompt(context, '').includes('日本語リポジトリ'));
    for (const provider of ['openai', 'anthropic']) {
      assert.match(fs.readFileSync(path.join(__dirname, '..', 'vendor', folder, 'llm', 'providers', provider + '.js'), 'utf8'), /require\("\.\.\/openai\/prompts"\)/);
    }
  }
});

test('review service writes the selected-language provider result into the saved report', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-review-'));
  const analysisId = '12345678-1234-4234-8234-123456789abc';
  const htmlPath = path.join(root, `${analysisId}.html`);
  const context = { repoName: 'sample' };
  fs.writeFileSync(path.join(root, `${analysisId}.llm-context.json`), JSON.stringify(context));
  try {
    for (const language of ['en', 'ja']) {
      const { getLlmProvider } = require(`../vendor/${language === 'ja' ? 'csap' : 'csap-en'}/llm/providers`);
      for (const providerId of ['openai', 'anthropic']) {
        const provider = getLlmProvider(providerId);
        const original = provider.analyzeFull;
        const expected = language === 'ja' ? '構造は良好です。' : 'The structure is healthy.';
        provider.analyzeFull = async (received, focus, options) => {
          assert.deepEqual(received, context);
          assert.equal(focus, 'graph-metrics');
          assert.equal(options.apiKey, 'test-key');
          return expected;
        };
        try {
          fs.writeFileSync(htmlPath, `<html lang="${language}"><div id="llmResult" data-md="">Pending</div></html>`);
          const result = await runLlmAnalysis({ analysisId, outputDir: root, provider: providerId, apiKey: 'test-key', displayLanguage: language });
          assert.equal(result.result, expected);
          const html = fs.readFileSync(htmlPath, 'utf8');
          assert.ok(html.includes(`data-md="${expected}"`));
          assert.equal(getReportLanguage(htmlPath), language);
        } finally { provider.analyzeFull = original; }
      }
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
