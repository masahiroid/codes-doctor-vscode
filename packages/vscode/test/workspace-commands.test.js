const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createCommands } = require('../lib/commands');
const { getLastAnalysis, setLastAnalysis } = require('../lib/lastAnalysisState');

/** A VS Code stand-in that records what the commands show, open and store. */
function mockVsCode({ folders = [], settings = {}, inputBox } = {}) {
  const log = { info: [], warning: [], error: [], opened: [], clipboard: '', secrets: new Map(), progress: [] };
  const vscode = {
    log,
    Uri: { file: (fsPath) => ({ fsPath, toString: () => `file://${fsPath}` }) },
    ProgressLocation: { Notification: 15 },
    workspace: {
      workspaceFolders: folders,
      getConfiguration: () => ({ get: (key, fallback) => (key in settings ? settings[key] : fallback), inspect: () => ({}) }),
    },
    env: {
      openExternal: async (uri) => { log.opened.push(uri.fsPath); return true; },
      clipboard: { writeText: async (text) => { log.clipboard = text; } },
    },
    window: {
      withProgress: async (_options, task) => task({ report: (value) => log.progress.push(value.message) }),
      showInformationMessage: (message) => { log.info.push(message); return Promise.resolve(undefined); },
      showWarningMessage: (message) => { log.warning.push(message); return Promise.resolve(undefined); },
      showErrorMessage: (message) => { log.error.push(message); return Promise.resolve(undefined); },
      showQuickPick: async (items) => items[0],
      showInputBox: async () => inputBox,
    },
  };
  return vscode;
}

const context = (vscode) => ({
  globalStorageUri: { fsPath: path.join(os.tmpdir(), 'cd-commands-storage') },
  secrets: {
    store: async (key, value) => vscode.log.secrets.set(key, value),
    delete: async (key) => vscode.log.secrets.delete(key),
  },
});

function project(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-commands-'));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });

test('analyze workspace: no folder open shows an error and does nothing else', async () => {
  const vscode = mockVsCode();
  await createCommands(vscode, context(vscode)).analyzeCurrentWorkspace();
  assert.equal(vscode.log.error.length, 1);
  assert.match(vscode.log.error[0], /No workspace folder is open/);
  assert.deepEqual(vscode.log.opened, []);
});

test('analyze workspace: writes the report to the custom folder, records it, opens it and reports the scores', async () => {
  const root = project({ 'src/a.ts': 'export function add(a: number, b: number) { return a + b; }\n' });
  const out = path.join(root, 'custom-out');
  try {
    const vscode = mockVsCode({ folders: [{ name: 'demo', uri: { fsPath: root } }], settings: { outputDirectory: 'custom-out', analysisLanguage: 'typescript' } });
    setLastAnalysis(undefined, undefined, undefined, undefined);
    await createCommands(vscode, context(vscode)).analyzeCurrentWorkspace();
    assert.deepEqual(vscode.log.error, []);
    const last = getLastAnalysis();
    assert.equal(last.outputDir, out);
    assert.ok(last.reportPath.startsWith(out));
    assert.ok(fs.existsSync(last.reportPath));
    assert.deepEqual(vscode.log.opened, [last.reportPath]);
    assert.deepEqual(vscode.log.progress, ['Analyzing demo (typescript)...', 'Opening report...']);
    assert.equal(vscode.log.info.length, 1);
    assert.match(vscode.log.info[0], /^Codes Doctor analysis ready \(Security: \d+\/100, Debt: \d+\/100\)$/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('analyze Git changes: errors, no changes, and a change set that is analyzed without opening the report', async () => {
  const notGit = project({ 'a.ts': 'export const x = 1;\n' });
  const repo = project({ 'src/a.ts': 'export const x = 1;\n', 'src/b.ts': 'export const y = 2;\n' });
  try {
    let vscode = mockVsCode({ folders: [{ name: 'plain', uri: { fsPath: notGit } }] });
    await createCommands(vscode, context(vscode)).analyzeGitChanges();
    assert.equal(vscode.log.error.length, 1);
    assert.match(vscode.log.error[0], /^Could not inspect Git changes: /);

    git(repo, 'init', '-q');
    git(repo, 'add', '.');
    git(repo, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '-m', 'init');
    vscode = mockVsCode({ folders: [{ name: 'repo', uri: { fsPath: repo } }] });
    await createCommands(vscode, context(vscode)).analyzeGitChanges();
    // A single commit has no HEAD~1, so nothing counts as changed.
    assert.deepEqual(vscode.log.info, ['No changed files detected in Git.']);

    fs.writeFileSync(path.join(repo, 'src/a.ts'), 'export const x = 3;\n');
    vscode = mockVsCode({ folders: [{ name: 'repo', uri: { fsPath: repo } }], settings: { outputDirectory: path.join(repo, 'out'), analysisLanguage: 'typescript' } });
    await createCommands(vscode, context(vscode)).analyzeGitChanges();
    assert.deepEqual(vscode.log.error, []);
    assert.deepEqual(vscode.log.opened, []);
    assert.deepEqual(vscode.log.progress, ['Analyzing repo (typescript)...']);
    assert.deepEqual(vscode.log.info, ['Git changes analysis ready (1 changed files, Issues: 0, God Classes: 0)']);
    assert.equal(getLastAnalysis().outputDir, path.join(repo, 'out'));
  } finally {
    fs.rmSync(notGit, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('set API key: built-in AI needs none; a key is stored trimmed, an empty key clears it, cancel changes nothing', async () => {
  let vscode = mockVsCode({ settings: { llmProvider: 'vscode-lm' } });
  await createCommands(vscode, context(vscode)).setLlmApiKey();
  assert.match(vscode.log.info[0], /does not require an API key/);

  vscode = mockVsCode({ settings: { llmProvider: 'anthropic' }, inputBox: '  sk-ant-test  ' });
  const ctx = context(vscode);
  await createCommands(vscode, ctx).setLlmApiKey();
  assert.deepEqual([...vscode.log.secrets.values()], ['sk-ant-test']);
  assert.deepEqual(vscode.log.info, ['Anthropic (Claude) API key saved.']);

  vscode.window.showInputBox = async () => '   ';
  vscode.log.info = [];
  await createCommands(vscode, ctx).setLlmApiKey();
  assert.equal(vscode.log.secrets.size, 0);
  assert.deepEqual(vscode.log.info, ['Anthropic (Claude) API key cleared.']);

  vscode.window.showInputBox = async () => undefined;
  vscode.log.info = [];
  await createCommands(vscode, ctx).setLlmApiKey();
  assert.deepEqual(vscode.log.info, []);
});
