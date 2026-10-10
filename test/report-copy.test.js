const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installReviewCopy, injectReviewCopy } = require('../lib/reportCopy');

test('copy includes the requested instruction and preserves Japanese Markdown in browser and webview', async () => {
  const markdown = '## 改善結果\n```js\nconst 値 = "$& $1 $` $\'";\n```\n😀';
  for (const webview of [false, true]) {
    let button, copied;
    const element = () => ({ style: {}, setAttribute() {}, append() {}, appendChild(child) { this.child = child; }, addEventListener(name, fn) { this.click = fn; } });
    const result = { getAttribute: () => markdown, before(toolbar) {} };
    const document = {
      documentElement: { lang: 'ja' }, body: { appendChild() {} },
      getElementById: id => id === 'llmResult' ? result : null,
      createElementNS(namespace, tag) { return { ...element(), tag }; },
      createElement(tag) { const el = element(); if (tag === 'button') button = el; return el; },
    };
    const context = { document, window: { addEventListener() {} }, navigator: { clipboard: { async writeText(text) { copied = text; } } } };
    if (webview) context.acquireVsCodeApi = () => ({ postMessage(message) { copied = message.text; } });
    vm.runInNewContext('(' + installReviewCopy.toString() + ')()', context);
    await button.click();
    assert.equal(copied, '以下のレポートに基づき、実際のコードを確認して改善を実装してください。まず依存抽出の正常性を確認し、再計測してください。その後、確認できた問題を優先順に修正し、既存の動作と公開インターフェースを維持してください。関連テストを実行し、変更内容・検証結果・未解決事項を報告してください。\n\n' + markdown);
    assert.equal(button.child.tag, 'svg');
  }
});

test('agent prompt is copied verbatim without the review instruction prefix', async () => {
  const markdown = '# 目的\n`UserService` を分割する。';
  let button, copied;
  const element = () => ({ style: {}, setAttribute() {}, append() {}, appendChild(child) { this.child = child; }, addEventListener(name, fn) { this.click = fn; } });
  const result = { getAttribute: () => markdown, before() {} };
  const document = {
    documentElement: { lang: 'ja' }, body: { appendChild() {} },
    getElementById: id => id === 'llmAgentPrompt' ? result : null,
    createElementNS(namespace, tag) { return { ...element(), tag }; },
    createElement(tag) { const el = element(); if (tag === 'button') button = el; return el; },
  };
  const context = { document, window: { addEventListener() {} }, navigator: { clipboard: { async writeText(text) { copied = text; } } } };
  vm.runInNewContext('(' + installReviewCopy.toString() + ')()', context);
  await button.click();
  assert.equal(copied, markdown);
});

test('existing copy script is upgraded without duplication or replacement token corruption', () => {
  const old = '<script>(function installReviewCopy() {\n// old\n})();</script>';
  const updated = injectReviewCopy(old);
  assert.ok(updated.includes(installReviewCopy.toString()));
  assert.equal(injectReviewCopy(updated), updated);
  assert.equal((updated.match(/function installReviewCopy/g) || []).length, 1);
});

test('copy upgrade never replaces escaped source examples inside pending AST templates', () => {
  const escapedSource = '&lt;script&gt;(function installReviewCopy() {\n// source example\n})();&lt;/script&gt;';
  const example = `<template data-ast-pending><details><pre>${escapedSource}</pre></details></template>`;
  const original = `<html><body>${example}<script>(function installReviewCopy() {\n// installed old version\n})();\n// Render initial saved Markdown results</script></body></html>`;
  const upgraded = injectReviewCopy(original);
  assert.ok(upgraded.includes(example), 'AST source and closing template must remain intact');
  assert.equal((upgraded.match(/<template/g) || []).length, (upgraded.match(/<\/template>/g) || []).length);
  assert.ok(upgraded.includes(installReviewCopy.toString()));
  assert.equal(injectReviewCopy(upgraded), upgraded);
});

test('legacy corruption is recognized without changing valid pending AST markup', () => {
  const { hasIncompleteAstMarkup } = require('../lib/reports/integrity');
  assert.equal(hasIncompleteAstMarkup('<template data-ast-pending><pre>source</pre></template>'), false);
  assert.equal(hasIncompleteAstMarkup('<template data-ast-pending><pre>source</pre>'), true);
  assert.equal(hasIncompleteAstMarkup('&lt;template data-ast-pending&gt;source'), false);
});
