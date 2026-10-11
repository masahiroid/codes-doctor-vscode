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
  const vscode = { workspace: { getConfiguration: () => ({ inspect: () => undefined, get: (_key, fallback) => fallback }) }, window: { showErrorMessage: message => errors.push(message) } };
  try {
    await openReport(vscode, reportPath, 'saved');
    assert.equal(errors.length, 1);
    assert.match(errors[0], /regenerate/);
    assert.equal(fs.readFileSync(reportPath, 'utf8'), original);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
