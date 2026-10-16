const test = require('node:test');
const assert = require('node:assert/strict');
const { updateDiagnostics } = require('../lib/diagnostics');
const { buildHoverMarkdown, createHoverProvider } = require('../lib/hoverProvider');
const { createStatusBarController } = require('../lib/statusBar');
const { FindingsTreeDataProvider } = require('../lib/findingsTreeView');
const { setLastAnalysis } = require('../lib/lastAnalysisState');

function createMockVsCode() {
  class Range {
    constructor(startLine, startChar, endLine, endChar) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  }
  class Location {
    constructor(uri, range) {
      this.uri = uri;
      this.range = range;
    }
  }
  class DiagnosticRelatedInformation {
    constructor(location, message) {
      this.location = location;
      this.message = message;
    }
  }
  class Diagnostic {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  }
  class MarkdownString {
    constructor(value) {
      this.value = value;
      this.isTrusted = false;
    }
  }
  class Hover {
    constructor(contents) {
      this.contents = contents;
    }
  }
  class TreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }
  class ThemeColor {
    constructor(id) {
      this.id = id;
    }
  }
  class EventEmitter {
    constructor() {
      this.listeners = [];
      this.event = (fn) => {
        this.listeners.push(fn);
        return { dispose: () => {} };
      };
    }
    fire(data) {
      for (const fn of this.listeners) fn(data);
    }
    dispose() {
      this.listeners = [];
    }
  }

  return {
    Range,
    Location,
    DiagnosticRelatedInformation,
    Diagnostic,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    MarkdownString,
    Hover,
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeColor,
    EventEmitter,
    StatusBarAlignment: { Left: 1, Right: 2 },
    Uri: { file: (fsPath) => ({ fsPath }) },
    workspace: {
      getConfiguration: () => ({ get: () => 'en', inspect: () => undefined }),
    },
    window: {
      createStatusBarItem: () => ({
        text: '',
        tooltip: '',
        command: '',
        backgroundColor: undefined,
        shown: false,
        show() {
          this.shown = true;
        },
        dispose() {},
      }),
    },
  };
}

const sampleResult = {
  analysisId: 'phase1-test',
  repoPath: '/repo',
  analyzedAt: '2026-10-16T00:00:00Z',
  summary: { totalFiles: 2, totalClasses: 1, totalMethods: 25, avgGodScore: 80 },
  securityScore: {
    overallScore: 70,
    grade: 'C',
    summary: { critical: 1, high: 0, medium: 1, low: 0, info: 1 },
    issues: [
      {
        type: 'critical',
        category: 'Command Injection',
        description: 'Untrusted input reaches exec()',
        filePath: '/repo/src/runner.ts',
        lineNumber: 20,
        recommendation: 'Use execFile with fixed arguments',
        confidence: 'flow',
        flow: {
          source: { line: 10, code: 'const cmd = req.query.cmd;' },
          steps: [{ line: 15, code: 'const full = `sh -c ${cmd}`;' }],
          sink: { line: 20, code: 'exec(full);' },
        },
      },
      {
        type: 'high',
        category: 'Hardcoded Secrets',
        description: 'Test token in spec',
        filePath: '/repo/test/runner.spec.ts',
        lineNumber: 5,
        recommendation: 'Move to env',
        inTest: true,
      },
      {
        type: 'info',
        category: 'Summary',
        description: 'Informational summary',
        filePath: '/repo/src/runner.ts',
        recommendation: 'None',
      },
    ],
  },
  godClasses: [
    {
      className: 'MegaController',
      filePath: '/repo/src/runner.ts',
      methodCount: 30,
      lineCount: 900,
      importCount: 20,
      propertyCount: 15,
      godScore: 85,
      rank: 'critical',
      warnings: ['Too many methods', 'Too many lines'],
    },
  ],
  circularDependencies: [{ cycle: ['a.ts', 'b.ts', 'a.ts'], length: 2 }],
};

test('updateDiagnostics: populates problems panel with security flows and God Classes', () => {
  const vscode = createMockVsCode();
  const entries = new Map();
  const collection = {
    cleared: false,
    clear() {
      this.cleared = true;
      entries.clear();
    },
    set(uri, diags) {
      entries.set(uri.fsPath, diags);
    },
  };

  updateDiagnostics(vscode, collection, sampleResult);
  assert.equal(collection.cleared, true);

  const runnerDiags = entries.get('/repo/src/runner.ts');
  assert.equal(runnerDiags.length, 2); // 1 critical security + 1 critical God Class (info is skipped)

  const secDiag = runnerDiags[0];
  assert.equal(secDiag.severity, vscode.DiagnosticSeverity.Error);
  assert.equal(secDiag.range.start.line, 19); // 20 - 1
  assert.ok(secDiag.message.includes('[Input reaches] [Command Injection]'));
  assert.equal(secDiag.relatedInformation.length, 3); // source, step, sink
  assert.equal(secDiag.relatedInformation[0].location.range.start.line, 9);

  const gcDiag = runnerDiags[1];
  assert.equal(gcDiag.severity, vscode.DiagnosticSeverity.Warning);
  assert.ok(gcDiag.message.includes('[God Class: MegaController]'));

  // Test file issue is downgraded to Information
  const testDiags = entries.get('/repo/test/runner.spec.ts');
  assert.equal(testDiags.length, 1);
  assert.equal(testDiags[0].severity, vscode.DiagnosticSeverity.Information);
  assert.ok(testDiags[0].message.includes('[Test code]'));
});

test('hoverProvider: provides markdown tooltip on security flow lines and God Class header', () => {
  const vscode = createMockVsCode();
  setLastAnalysis('phase1-test', '/tmp', '/tmp/report.html', undefined, sampleResult);

  // Hover on line 15 (intermediate step of flow)
  const stepBlocks = buildHoverMarkdown(vscode, '/repo/src/runner.ts', 15, sampleResult);
  assert.equal(stepBlocks.length, 1);
  assert.ok(stepBlocks[0].includes('Command Injection'));
  assert.ok(stepBlocks[0].includes('Traced Data Flow'));
  assert.ok(stepBlocks[0].includes('L10'));
  assert.ok(stepBlocks[0].includes('L15'));
  assert.ok(stepBlocks[0].includes('L20'));

  // Hover on line 1 (God Class header)
  const line1Blocks = buildHoverMarkdown(vscode, '/repo/src/runner.ts', 1, sampleResult);
  assert.equal(line1Blocks.length, 1);
  assert.ok(line1Blocks[0].includes('MegaController'));
  assert.ok(line1Blocks[0].includes('Too many methods'));

  // Hover provider returns Hover object
  const provider = createHoverProvider(vscode);
  const hover = provider.provideHover({ uri: { fsPath: '/repo/src/runner.ts' } }, { line: 19 });
  assert.ok(hover);
  assert.ok(hover.contents.value.includes('execFile'));

  // Unrelated line returns null
  const noHover = provider.provideHover({ uri: { fsPath: '/repo/src/runner.ts' } }, { line: 50 });
  assert.equal(noHover, null);
});

test('statusBar: updates text and warning state when analysis changes', () => {
  const vscode = createMockVsCode();
  setLastAnalysis(undefined);
  const controller = createStatusBarController(vscode);
  assert.equal(controller.item.text, '$(pulse) Codes Doctor');

  // Update with passing summary
  setLastAnalysis(
    'phase1-test',
    '/tmp',
    '/tmp/report.html',
    {
      reportPath: '/tmp/report.html',
      analyzedFiles: 2,
      security: { score: 90, grade: 'A', critical: 0, high: 0 },
      technicalDebt: { score: 85, grade: 'A' },
      criticalGodClasses: 0,
      circularDependencies: 0,
      failures: [],
    },
    sampleResult
  );
  assert.equal(controller.item.text, '$(shield) Sec: 90 | $(tools) Debt: 85');
  assert.equal(controller.item.backgroundColor, undefined);
  assert.equal(controller.item.command, 'codeDoctor.openLastReport');

  // Update with failing threshold
  setLastAnalysis(
    'phase1-test',
    '/tmp',
    '/tmp/report.html',
    {
      reportPath: '/tmp/report.html',
      analyzedFiles: 2,
      security: { score: 70, grade: 'C', critical: 1, high: 0 },
      technicalDebt: { score: 85, grade: 'A' },
      criticalGodClasses: 1,
      circularDependencies: 1,
      failures: ['security 70 < 80'],
    },
    sampleResult
  );
  assert.ok(controller.item.text.includes('$(warning)'));
  assert.equal(controller.item.backgroundColor.id, 'statusBarItem.warningBackground');
  controller.dispose();
});

test('FindingsTreeDataProvider: lists categories, issues, and data flow steps', () => {
  const vscode = createMockVsCode();
  const tree = new FindingsTreeDataProvider(vscode);

  // Empty state
  setLastAnalysis(undefined);
  const emptyRoots = tree.getChildren();
  assert.equal(emptyRoots.length, 1);
  assert.equal(emptyRoots[0].kind, 'empty');

  // Populated state
  setLastAnalysis('phase1-test', '/tmp', '/tmp/report.html', undefined, sampleResult);
  const categories = tree.getChildren();
  assert.equal(categories.length, 3);
  assert.equal(categories[0].count, 2); // 2 non-info security issues
  assert.equal(categories[1].count, 1); // 1 God Class
  assert.equal(categories[2].count, 1); // 1 Circular Dependency

  // Security children
  const secChildren = tree.getChildren(categories[0]);
  assert.equal(secChildren.length, 2);
  const secItem = tree.getTreeItem(secChildren[0]);
  assert.equal(secItem.label, '[CRITICAL] Command Injection');
  assert.deepEqual(secItem.command.arguments, ['/repo/src/runner.ts', 20]);

  // Flow steps under traced security issue
  const flowSteps = tree.getChildren(secChildren[0]);
  assert.equal(flowSteps.length, 3);
  const sourceItem = tree.getTreeItem(flowSteps[0]);
  assert.ok(sourceItem.label.includes('L10'));
  assert.deepEqual(sourceItem.command.arguments, ['/repo/src/runner.ts', 10]);

  tree.dispose();
});

