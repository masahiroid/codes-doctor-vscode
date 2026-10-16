const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, formatSummary } = require('../lib/summary');
const { createCommands } = require('../lib/commands');
const { setLastAnalysis, getLastAnalysis } = require('../lib/lastAnalysisState');

test('summarize: calculates scores and quality gate failures correctly', () => {
  const mockResult = {
    summary: { totalFiles: 5 },
    technicalDebt: { overallScore: 75, grade: 'B' },
    securityScore: {
      overallScore: 82,
      grade: 'B',
      summary: { critical: 1, high: 2 },
    },
    godClasses: [{ rank: 'critical' }, { rank: 'high' }],
    circularDependencies: ['a -> b -> a'],
  };

  // When scores satisfy thresholds
  const passed = summarize(mockResult, '/path/report.html', { minSecurity: 80, minTechnicalDebt: 70 });
  assert.equal(passed.failures.length, 0);
  assert.equal(passed.criticalGodClasses, 1);
  assert.equal(passed.circularDependencies, 1);
  assert.equal(passed.security?.score, 82);
  assert.equal(passed.technicalDebt?.score, 75);

  // When security fails threshold
  const failedSecurity = summarize(mockResult, '/path/report.html', { minSecurity: 90, minTechnicalDebt: 70 });
  assert.deepEqual(failedSecurity.failures, ['security 82 < 90']);

  // When both fail threshold
  const failedBoth = summarize(mockResult, '/path/report.html', { minSecurity: 90, minTechnicalDebt: 80 });
  assert.deepEqual(failedBoth.failures, ['security 82 < 90', 'technical debt 75 < 80']);

  // Empty analysis (0 files) never fails
  const empty = summarize({ summary: { totalFiles: 0 } }, '/path/report.html', { minSecurity: 80 });
  assert.equal(empty.failures.length, 0);
  assert.equal(empty.analyzedFiles, 0);
});

test('formatSummary: formats human-readable text correctly', () => {
  const summary = {
    reportPath: '/output/report.html',
    analyzedFiles: 10,
    technicalDebt: { score: 85, grade: 'A' },
    security: { score: 90, grade: 'A', critical: 0, high: 1 },
    criticalGodClasses: 0,
    circularDependencies: 0,
    failures: ['security 90 < 95'],
  };
  const text = formatSummary(summary);
  assert.ok(text.includes('Report:'));
  assert.ok(text.includes('/output/report.html'));
  assert.ok(text.includes('Technical debt:'));
  assert.ok(text.includes('85/100 (A)'));
  assert.ok(text.includes('Security:'));
  assert.ok(text.includes('critical 0, high 1'));
  assert.ok(text.includes('FAILED: security 90 < 95'));
});

test('copySummary and copySummaryJson: copies to clipboard correctly', async () => {
  let clipboardText = '';
  let infoMessage = '';
  let warningMessage = '';

  const mockVsCode = {
    workspace: {
      workspaceFolders: [],
      getConfiguration: () => ({ get: () => undefined, inspect: () => undefined }),
    },
    env: {
      clipboard: {
        writeText: async (text) => {
          clipboardText = text;
        },
      },
    },
    window: {
      showInformationMessage: (msg) => {
        infoMessage = msg;
      },
      showWarningMessage: (msg) => {
        warningMessage = msg;
      },
    },
  };

  const commands = createCommands(mockVsCode, { globalStorageUri: { fsPath: '/tmp' } });

  // When no analysis exists yet
  setLastAnalysis(undefined, undefined, undefined, undefined);
  await commands.copySummary();
  assert.ok(warningMessage.includes('No analysis results available'));

  // When analysis exists
  const mockSummary = {
    reportPath: '/test/report.html',
    analyzedFiles: 3,
    technicalDebt: { score: 95, grade: 'A' },
    security: { score: 100, grade: 'A', critical: 0, high: 0 },
    criticalGodClasses: 0,
    circularDependencies: 0,
    failures: [],
  };
  setLastAnalysis('test-id', '/test', '/test/report.html', mockSummary);

  await commands.copySummary();
  assert.ok(clipboardText.includes('Report:'));
  assert.ok(clipboardText.includes('100/100 (A)'));
  assert.ok(infoMessage.includes('copied to clipboard'));

  await commands.copySummaryJson();
  const parsed = JSON.parse(clipboardText);
  assert.equal(parsed.analyzedFiles, 3);
  assert.equal(parsed.security.score, 100);
});

