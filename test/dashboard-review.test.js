const test = require('node:test');
const assert = require('node:assert/strict');
const { executeDashboardReview } = require('../lib/dashboardReview');

test('dashboard public review method preserves missing-analysis error and in-flight guard', async () => {
  const errors = [];
  const provider = { isRunningLlmAnalysis: true, vscode: { window: { showErrorMessage: value => errors.push(value) } }, t: value => value };
  await executeDashboardReview(provider);
  assert.deepEqual(errors, []);
  provider.isRunningLlmAnalysis = false;
  await executeDashboardReview(provider);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Analyze Current Workspace/);
});

test('extracted review workflow preserves request, completion and error state', async () => {
  const analyzer = require('../lib/analyzer');
  const viewer = require('../lib/reportViewer');
  const originalRun = analyzer.runLlmAnalysis;
  const originalOpen = viewer.openReport;
  const helperPath = require.resolve('../lib/dashboardReview');
  const calls = [];
  analyzer.runLlmAnalysis = async params => calls.push(params);
  viewer.openReport = async (...args) => calls.push(args);
  delete require.cache[helperPath];
  const { executeDashboardReview } = require(helperPath);
  const { setLastAnalysis } = require('../lib/lastAnalysisState');
  setLastAnalysis('analysis', '/reports', '/report.html');
  const settings = { llmProvider: 'openai', llmModel: 'test-model', llmMaxOutputTokens: 2000, reportOpenMode: 'external' };
  const errors = [], messages = [];
  const dashboard = {
    context: { secrets: { get: async () => 'test-key' } },
    vscode: { workspace: { getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }) }, ProgressLocation: { Notification: 1 }, window: { withProgress: async (_, task) => task(), showErrorMessage: x => errors.push(x), showInformationMessage: x => messages.push(x) } },
    t: x => x, render() {}, isRunningLlmAnalysis: false,
  };
  try {
    await executeDashboardReview(dashboard);
    assert.equal(calls[0].analysisId, 'analysis');
    assert.equal(calls[0].maxOutputTokens, 2000);
    assert.equal(calls[0].apiKey, 'test-key');
    assert.equal(calls.length, 2);
    assert.equal(dashboard.llmAnalysisStatus.kind, 'done');
    assert.equal(dashboard.isRunningLlmAnalysis, false);
    assert.equal(messages.length, 1);
    analyzer.runLlmAnalysis = async () => { throw new Error('failed'); };
    delete require.cache[helperPath];
    await require(helperPath).executeDashboardReview(dashboard);
    assert.equal(dashboard.llmAnalysisStatus.kind, 'error');
    assert.equal(dashboard.llmAnalysisStatus.message, 'failed');
    assert.equal(dashboard.isRunningLlmAnalysis, false);
    assert.equal(errors.length, 1);
  } finally {
    analyzer.runLlmAnalysis = originalRun;
    viewer.openReport = originalOpen;
    delete require.cache[helperPath];
  }
});
