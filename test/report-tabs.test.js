const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { installReportTabs, injectReportTabs, TAB_SCRIPT_ID } = require('../lib/reportTabs');

function environment(storage, mermaid) {
  const ids = ['overview', 'graphs', 'llm', 'ast', 'risk', 'supply'];
  function classes(active) { return { active, contains() { return this.active; }, toggle(_name, value) { this.active = value; } }; }
  const buttons = ids.map(id => ({ getAttribute: () => id, classList: classes(id === 'overview') }));
  const panels = ids.map(id => ({ id: 'tab-' + id, classList: classes(id === 'overview') }));
  const nav = { dataset: {}, querySelectorAll: () => buttons, contains: button => buttons.includes(button), addEventListener(_event, callback) { this.click = callback; } };
  return { nav, buttons, panels, document: { title: 'Report', body: { dataset: { analysisId: 'test-analysis' } }, getElementById: () => nav, querySelectorAll: () => panels }, sessionStorage: storage, mermaid };
}

test('all tabs remain clickable with blocked storage and failing diagram rendering', () => {
  const storage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
  const context = environment(storage, { run() { throw new Error('diagram failure'); } });
  vm.runInNewContext('(' + installReportTabs.toString() + ')()', context);
  for (const button of context.buttons) {
    context.nav.click({ target: { closest: () => button } });
    assert.equal(context.panels.filter(panel => panel.classList.active).length, 1);
    assert.equal(context.panels.find(panel => panel.classList.active).id, 'tab-' + button.getAttribute());
  }
});

test('saved tab is restored, invalid saved tab falls back, and installation is idempotent', () => {
  for (const saved of ['ast', 'deleted-tab']) {
    const storage = new Map([['csap-tab-test-analysis', saved]]);
    const context = environment({ getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });
    vm.runInNewContext('(' + installReportTabs.toString() + ')()', context);
    assert.equal(context.panels.find(panel => panel.classList.active).id, saved === 'ast' ? 'tab-ast' : 'tab-overview');
    const click = context.nav.click;
    vm.runInNewContext('(' + installReportTabs.toString() + ')()', context);
    assert.equal(context.nav.click, click);
  }
});

test('existing reports gain an independent tab script despite errors in optional scripts', () => {
  const old = `<html><body><nav id="tabNav"></nav><script>throw new Error('markdown failed'); (function(){\nconst nav = document.getElementById('tabNav');\nconst storageKey = 'csap-tab-existing-analysis';
const saved = sessionStorage.getItem('key');\n})();</script></body></html>`;
  const html = injectReportTabs(old);
  assert.ok(html.includes(`id="${TAB_SCRIPT_ID}"`));
  assert.equal(injectReportTabs(html), html);
  assert.match(html, /data-analysis-id="existing-analysis"/);
  assert.doesNotMatch(html, /const saved = sessionStorage.getItem\('key'\)/);
  const context = environment({ getItem() { throw new Error('blocked'); }, setItem() {} });
  let failures = 0;
  for (const [, script] of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
    try { vm.runInNewContext(script, context); } catch { failures++; }
  }
  assert.equal(failures, 1);
  context.nav.click({ target: { closest: () => context.buttons[3] } });
  assert.equal(context.panels[3].classList.active, true);
});

test('navigation injection preserves body-closing strings inside embedded library scripts', () => {
  const library = '<script>const exportedHtml = "<body>diagram</body>";</script>';
  const html = `<html><body><nav id="tabNav"></nav>${library}</body></html>`;
  const updated = injectReportTabs(html);
  assert.ok(updated.includes(library));
  assert.ok(updated.indexOf(`id="${TAB_SCRIPT_ID}"`) > updated.indexOf(library));
  assert.equal(injectReportTabs(updated), updated);
});
