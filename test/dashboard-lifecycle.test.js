const test = require('node:test');
const assert = require('node:assert/strict');
const { CodeDoctorDashboardViewProvider } = require('../lib/dashboardView');

test('VS Code adapter replaces view subscriptions, routes messages and releases detached views', async () => {
  let configurationChanged;
  let disposed = 0;
  const vscode = { workspace: {
    getConfiguration: () => ({ get: (_, fallback) => fallback, inspect: () => ({}) }),
    onDidChangeConfiguration(callback) { configurationChanged = callback; return { dispose() { disposed++; } }; },
  } };
  const provider = new CodeDoctorDashboardViewProvider(vscode, { globalStorageUri: { fsPath: '/nonexistent-history' } });
  const received = [];
  provider.controller.handleMessage = async input => { received.push(input); };
  const createView = () => {
    let message, closed;
    return {
      webview: { cspSource: 'https://webview.invalid', html: '', onDidReceiveMessage(callback) { message = callback; return { dispose() { disposed++; } }; } },
      onDidDispose(callback) { closed = callback; return { dispose() { disposed++; } }; },
      receive: input => message(input), close: () => closed(),
    };
  };
  const first = createView(), second = createView();
  provider.resolveWebviewView(first);
  assert.match(first.webview.html, /Content-Security-Policy/);
  await first.receive({ type: 'fetchModels' });
  assert.deepEqual(received, [{ type: 'fetchModels' }]);
  provider.resolveWebviewView(second);
  assert.equal(disposed, 2);
  first.close();
  assert.equal(provider.currentView, second);
  second.close();
  configurationChanged({ affectsConfiguration: () => true });
  assert.equal(provider.currentView, null);
  provider.dispose();
  assert.equal(disposed, 5);
});
