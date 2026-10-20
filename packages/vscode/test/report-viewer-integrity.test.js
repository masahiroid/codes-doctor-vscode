const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openReport } = require('../lib/reportViewer');

test('opening a damaged saved report explains regeneration and preserves its contents', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-incomplete-report-'));
  const reportPath = path.join(root, 'saved.html');
  const original = '<html><body><template data-ast-pending><pre>source</pre></body></html>';
  fs.writeFileSync(reportPath, original);
  const errors = [];
  const vscode = { Uri: { file: file => ({ fsPath: file }) }, workspace: { getConfiguration: () => ({ inspect: () => undefined, get: (key, fallback) => key === 'reportOpenMode' ? 'webview' : fallback }) }, window: { showErrorMessage: message => errors.push(message) } };
  try {
    await openReport(vscode, reportPath, 'saved');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /regenerate/);
    assert.equal(fs.readFileSync(reportPath, 'utf8'), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const mode of ['external', 'webview']) {
  test(`${mode}: a large report opens without reading or rewriting its contents`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-large-report-'));
    const reportPath = path.join(root, 'large.html');
    const fd = fs.openSync(reportPath, 'w');
    fs.ftruncateSync(fd, 364 * 1024 * 1024);
    fs.closeSync(fd);
    const opened = [];
    const vscode = {
      workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'reportOpenMode' ? mode : fallback }) },
      Uri: { file: file => ({ fsPath: file }) },
      env: { openExternal: async uri => { opened.push(uri.fsPath); return true; } },
    };
    const readFile = fs.promises.readFile;
    fs.promises.readFile = async () => { throw new Error('Must not load large report'); };
    try {
      await openReport(vscode, reportPath, 'large');
      assert.deepEqual(opened, [reportPath]);
      assert.equal(fs.statSync(reportPath).size, 364 * 1024 * 1024);
    } finally {
      fs.promises.readFile = readFile;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('external browser failure is reported to the user', async () => {
  const errors = [];
  const vscode = {
    workspace: { getConfiguration: () => ({ get: () => 'external' }) },
    Uri: { file: file => ({ fsPath: file }) },
    env: { openExternal: async () => false },
    window: { showErrorMessage: message => errors.push(message) },
  };
  await openReport(vscode, __filename, 'failed');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Could not open report/);
});
