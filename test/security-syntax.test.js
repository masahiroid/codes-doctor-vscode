const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
for (const folder of ['csap', 'csap-en']) {
  test(`${folder}: examples and RegExp calls are ignored, executable risks remain`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-security-'));
    try {
      const filename = path.join(root, 'sample.ts');
      fs.writeFileSync(filename, [
        'const sample = "eval(input); element.innerHTML = input; exec(input)";',
        'const regex = /exec(input)/;',
        '/foo/.exec(input);',
        '// eval(input)',
        '/* exec(input) */ const safe = 1;',
        'eval(input);',
        'childProcess.exec(input);',
        'element.innerHTML = input;',
        'const template = `example eval(input) ${eval(input)}`;',
        'const password = "actual-secret";',
      ].join('\n'));
      const result = await require(`../vendor/${folder}/analyzer/securityScore`).calculateSecurityScore([{ filePath: filename }], [], root);
      assert.deepEqual(result.issues.filter(i => i.type !== 'info').map(i => i.lineNumber).sort((a,b) => a-b), [6,7,8,9,10]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('dashboard rejects arbitrary VS Code commands and malformed messages', async () => {
  const { handleDashboardMessage } = require('../lib/dashboard/actions');
  const calls = [];
  const dashboard = { vscode: { commands: { executeCommand: async value => calls.push(value) } } };
  for (const value of [null, 1, 'command', {}, { type: 'command', command: 'workbench.action.terminal.new' }]) await handleDashboardMessage(dashboard, value);
  await handleDashboardMessage(dashboard, { type: 'command', command: 'codeDoctor.analyzeCurrentWorkspace' });
  assert.deepEqual(calls, ['codeDoctor.analyzeCurrentWorkspace']);
});

test('repository names cannot inject HTML into generated reports', async () => {
  const { analyzeWorkspace } = require('../lib/analyzer');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-name-'));
  const repo = path.join(root, '<img src=x onerror=alert(1)>');
  const output = path.join(root, 'reports');
  fs.mkdirSync(repo); fs.mkdirSync(output);
  fs.writeFileSync(path.join(repo, 'sample.ts'), 'export class Example { run() {} }');
  try {
    for (const language of ['en', 'ja']) {
      const report = await analyzeWorkspace(repo, 'typescript', output, language);
      const html = fs.readFileSync(report.reportPath, 'utf8');
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
      assert.ok(!html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').includes('<img src=x onerror=alert(1)>'));
      for (const [, script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new (require('node:vm').Script)(script);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
