const test = require('node:test');
const assert = require('node:assert/strict');
const { Marked } = require('marked');
const { installJapaneseStrong } = require('../lib/enginePatches');

test('Japanese bold adjacent to prose and punctuation renders with nested inline code', () => {
  const marked = new Marked();
  const sample = '**「注意は必要だが許容範囲」**です。';
  assert.doesNotMatch(marked.parse(sample), /<strong>/);
  installJapaneseStrong(marked);
  assert.equal(marked.parse(sample), '<p><strong>「注意は必要だが許容範囲」</strong>です。</p>\n');
  assert.match(marked.parse('これは**要コード確認**です。'), /これは<strong>要コード確認<\/strong>です/);
  assert.match(marked.parse('- **対象：`foo.js`**です。'), /<strong>対象：<code>foo.js<\/code><\/strong>です/);
  assert.match(marked.parse('**English** text'), /<strong>English<\/strong>/);
});

test('code, escaped delimiters, and incomplete bold remain literal', () => {
  const marked = new Marked();
  installJapaneseStrong(marked);
  for (const input of ['`**「注意」**`', '```js\n**「注意」**\n```', '\\*\\*「注意」\\*\\*', '**未完了', '** 空白 **']) {
    assert.doesNotMatch(marked.parse(input), /<strong>/);
  }
});

test('both report languages retain actionable full and AST review instructions', () => {
  for (const folder of ['csap', 'csap-en']) {
    const prompts = require(`../vendor/${folder}/llm/openai/prompts`);
    for (const prompt of [prompts.buildFullAnalysisSystemPrompt(), prompts.buildAstOnlySystemPrompt()]) {
      assert.match(prompt, /acceptance checks/);
      assert.match(prompt, /implement only confirmed issues/);
      assert.match(prompt, /remeasurement/);
      assert.match(prompt, /Keep the existing report sections/);
    }
  }
});
