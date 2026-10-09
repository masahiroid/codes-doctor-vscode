const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { getDisplayLanguage } = require('../lib/config');
const { CodeDoctorDashboardViewProvider } = require('../lib/dashboardView');
const { createDashboardController } = require('../lib/dashboard/controller');
const { buildModelField } = require('../lib/dashboard/controls');

function mockVscode(settings) {
  return {
    workspace: {
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback, inspect: (key) => ({ globalValue: settings[key] }), update: async (key, value) => { settings[key] = value; } }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    ConfigurationTarget: { Global: 1 },
  };
}

test('English default, Japanese selection, stable webview control IDs and scripts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-dashboard-'));
  try {
    const settings = {};
    const vscode = mockVscode(settings);
    const dashboard = createDashboardController(vscode, { globalStorageUri: { fsPath: root } });
    assert.equal(getDisplayLanguage(vscode), 'en');
    for (const language of ['en', 'ja']) {
      await dashboard.handleMessage({ type: 'setSetting', key: 'displayLanguage', value: language });
      const html = dashboard.buildHtml();
      assert.match(html, new RegExp(`<html lang="${language}">`));
      assert.ok(html.includes(language === 'ja' ? '現在のワークスペースを解析' : 'Analyze Current Workspace'));
      assert.match(html, /id="llmModel"/);
      if (language === 'ja') {
        assert.ok(html.includes('レポートはまだありません。'));
        assert.ok(html.includes('先にワークスペースを解析してください。'));
      }
      assert.match(html, /data-action="fetchModels"/);
      for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
    }
    await dashboard.handleMessage({ type: 'setSetting', key: 'displayLanguage', value: 'invalid' });
    assert.equal(settings.displayLanguage, 'ja');
    settings.llmModel = '日本語<model>"';
    assert.match(buildModelField(dashboard), /日本語&lt;model&gt;&quot;/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('saved display language survives workspace overrides, rerenders, and dashboard recreation', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-language-'));
  const userSettings = {};
  const workspaceSettings = { displayLanguage: 'en' };
  let onConfigurationChange;
  const vscode = {
    workspace: {
      getConfiguration: () => ({
        get: (key, fallback) => workspaceSettings[key] ?? userSettings[key] ?? fallback,
        inspect: (key) => ({ globalValue: userSettings[key], workspaceValue: workspaceSettings[key] }),
        update: async (key, value, target) => {
          assert.equal(target, vscode.ConfigurationTarget.Global);
          userSettings[key] = value;
          onConfigurationChange({ affectsConfiguration: () => true });
        },
      }),
      onDidChangeConfiguration: (callback) => {
        onConfigurationChange = callback;
        return { dispose() {} };
      },
    },
    ConfigurationTarget: { Global: 1 },
  };
  const context = { globalStorageUri: { fsPath: root } };
  let provider = new CodeDoctorDashboardViewProvider(vscode, context);
  let dashboard = provider.controller;
  const view = { webview: { html: '' } };
  provider.currentView = view;
  try {
    await dashboard.handleMessage({ type: 'setSetting', key: 'displayLanguage', value: 'ja' });
    assert.equal(userSettings.displayLanguage, 'ja');
    assert.match(view.webview.html, /<html lang="ja">/);
    await dashboard.handleMessage({ type: 'setSetting', key: 'analysisLanguage', value: 'python' });
    dashboard.render();
    assert.equal(getDisplayLanguage(vscode), 'ja');
    assert.match(view.webview.html, /<option value="ja" selected>/);
    provider.dispose();
    provider = new CodeDoctorDashboardViewProvider(vscode, context);
    dashboard = provider.controller;
    assert.match(dashboard.buildHtml(), /<html lang="ja">/);
    workspaceSettings.displayLanguage = 'ja';
    await dashboard.handleMessage({ type: 'setSetting', key: 'displayLanguage', value: 'en' });
    assert.equal(getDisplayLanguage(vscode), 'en');
    assert.match(dashboard.buildHtml(), /<option value="en" selected>/);
  } finally {
    provider.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('manifest localization has complete English and Japanese catalogs', () => {
  const manifest = require('../package.json');
  const english = require('../package.nls.json');
  const japanese = require('../package.nls.ja.json');
  for (const [, key] of JSON.stringify(manifest).matchAll(/%([^%]+)%/g)) {
    assert.ok(english[key], `Missing English metadata: ${key}`);
    assert.ok(japanese[key], `Missing Japanese metadata: ${key}`);
  }
  assert.equal(manifest.version, require('../package-lock.json').version);
  assert.equal(manifest.contributes.configuration.properties['codeDoctor.displayLanguage'].default, 'en');
  assert.equal(manifest.contributes.configuration.properties['codeDoctor.displayLanguage'].scope, 'application');
});

test('dashboard persists and validates output token limits in both languages', async () => {
  const { getLlmMaxOutputTokens } = require('../lib/config');
  const settings = {};
  const vscode = mockVscode(settings);
  const dashboard = createDashboardController(vscode, { globalStorageUri: { fsPath: os.tmpdir() } });
  assert.equal(getLlmMaxOutputTokens(vscode), 16000);
  for (const language of ['en', 'ja']) {
    settings.displayLanguage = language;
    await dashboard.handleMessage({ type: 'setLlmMaxOutputTokens', value: 25000 });
    assert.equal(getLlmMaxOutputTokens(vscode), 25000);
    assert.match(dashboard.buildHtml(), /id="llmMaxOutputTokens"[^>]*value="25000"/);
    for (const [, script] of dashboard.buildHtml().matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  }
  for (const value of [0, -1, 199, 25000.5, NaN, Infinity, '32000', 1000001]) {
    await dashboard.handleMessage({ type: 'setLlmMaxOutputTokens', value });
    assert.equal(settings.llmMaxOutputTokens, 25000);
  }
  settings.llmMaxOutputTokens = -1;
  assert.equal(getLlmMaxOutputTokens(vscode), 16000);
});
