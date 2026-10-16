const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseIgnoreComments,
  isIssueIgnored,
  applyIgnoreComments,
  createIgnoreCodeActionProvider,
} = require('../lib/ignoreComments');
const {
  parseGitStatusPorcelain,
  filterResultByChangedFiles,
} = require('../lib/gitDiff');
const { createOnSaveController } = require('../lib/onSaveWatcher');
const { setLastAnalysis, getLastAnalysis } = require('../lib/lastAnalysisState');

test('parseIgnoreComments and isIssueIgnored: supports line, next-line, file, and category-specific ignores', () => {
  const source = [
    '// code-doctor-ignore-next-line SQL Injection',
    'const q1 = db.query(req.query.id);',
    'const q2 = eval(req.body.code); // code-doctor-ignore',
    'const q3 = exec(req.body.cmd);',
  ].join('\n');

  const rules = parseIgnoreComments(source);
  assert.equal(rules.ignoreFile, false);
  assert.equal(isIssueIgnored(rules, 2, 'SQL Injection'), true);
  assert.equal(isIssueIgnored(rules, 2, 'XSS'), false);
  assert.equal(isIssueIgnored(rules, 3, 'Code Injection'), true);
  assert.equal(isIssueIgnored(rules, 4, 'Command Injection'), false);

  const fileIgnored = parseIgnoreComments('# code-doctor-ignore-file\nprint("hello")\n');
  assert.equal(fileIgnored.ignoreFile, true);
  assert.equal(isIssueIgnored(fileIgnored, 2, 'Any Category'), true);
});

test('applyIgnoreComments: filters ignored security issues and God Classes and updates summary counts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-doctor-ignore-'));
  try {
    const fileA = path.join(tmpDir, 'a.ts');
    fs.writeFileSync(
      fileA,
      [
        '// code-doctor-ignore-next-line SQL Injection',
        'const q = db.query(input);',
        'const ok = 1;',
      ].join('\n'),
      'utf8',
    );

    const rawResult = {
      repoPath: tmpDir,
      summary: { totalFiles: 1, totalClasses: 1, criticalClasses: 1, avgGodScore: 95 },
      godClasses: [
        {
          className: 'IgnoredGod',
          filePath: 'a.ts',
          lineCount: 600,
          methodCount: 30,
          propertyCount: 10,
          importCount: 5,
          godScore: 95,
          rank: 'critical',
        },
      ],
      securityScore: {
        score: 75,
        grade: 'C',
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        issues: [
          {
            type: 'critical',
            category: 'SQL Injection',
            filePath: 'a.ts',
            lineNumber: 2,
            description: 'Unsanitized SQL query',
            codeSnippet: 'const q = db.query(input);',
            recommendation: 'Use parameterized queries',
          },
        ],
      },
    };

    const afterLineIgnore = applyIgnoreComments(rawResult);
    assert.equal(afterLineIgnore.securityScore.issues.length, 0);
    assert.equal(afterLineIgnore.securityScore.summary.critical, 0);
    assert.equal(afterLineIgnore.godClasses.length, 1);

    // Now ignore entire file
    fs.writeFileSync(fileA, '// code-doctor-ignore-file\nclass IgnoredGod {}\n', 'utf8');
    const afterFileIgnore = applyIgnoreComments(rawResult);
    assert.equal(afterFileIgnore.godClasses.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createIgnoreCodeActionProvider: provides Quick Fix actions for Codes Doctor diagnostics', () => {
  class Position {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  }
  class WorkspaceEdit {
    constructor() {
      this.inserts = [];
    }
    insert(uri, pos, text) {
      this.inserts.push({ uri, pos, text });
    }
  }
  class CodeAction {
    constructor(title, kind) {
      this.title = title;
      this.kind = kind;
    }
  }
  const vscodeMock = {
    Position,
    WorkspaceEdit,
    CodeAction,
    CodeActionKind: { QuickFix: 'quickfix' },
    workspace: {
      getConfiguration: () => ({
        get: (_k, def) => def,
      }),
    },
  };

  const provider = createIgnoreCodeActionProvider(vscodeMock);
  const document = {
    uri: { fsPath: '/workspace/src/app.ts' },
    lineAt: () => ({ text: '    const q = db.query(userInput);' }),
  };
  const context = {
    diagnostics: [
      {
        source: 'Codes Doctor',
        code: 'SQL Injection',
        range: { start: { line: 4, character: 0 } },
      },
      {
        source: 'Codes Doctor',
        code: 'God Class',
        range: { start: { line: 0, character: 0 } },
      },
    ],
  };

  const actions = provider.provideCodeActions(document, {}, context);
  assert.equal(actions.length, 2);
  assert.match(actions[0].title, /SQL Injection/);
  assert.equal(actions[0].edit.inserts[0].pos.line, 4);
  assert.equal(actions[0].edit.inserts[0].text, '    // code-doctor-ignore-next-line SQL Injection\n');
  assert.match(actions[1].title, /Ignore God Class/);
  assert.equal(actions[1].edit.inserts[0].pos.line, 0);
  assert.equal(actions[1].edit.inserts[0].text, '// code-doctor-ignore-file\n');
});

test('parseGitStatusPorcelain and filterResultByChangedFiles: extracts modified/renamed files and filters results', () => {
  const porcelain = [
    ' M src/changed.ts',
    'A  src/added.ts',
    'D  src/deleted.ts',
    'R  src/old.ts -> src/renamed.ts',
    '?? src/untracked.ts',
  ].join('\n');

  const parsed = parseGitStatusPorcelain(porcelain, '/workspace');
  assert.deepEqual(parsed.sort(), [
    '/workspace/src/added.ts',
    '/workspace/src/changed.ts',
    '/workspace/src/renamed.ts',
    '/workspace/src/untracked.ts',
  ]);

  const fullResult = {
    repoPath: '/workspace',
    summary: { totalFiles: 10, totalClasses: 2, criticalClasses: 2, avgGodScore: 80 },
    godClasses: [
      { className: 'ChangedGod', filePath: 'src/changed.ts', lineCount: 500, methodCount: 25, propertyCount: 5, importCount: 5, godScore: 80, rank: 'critical' },
      { className: 'UnchangedGod', filePath: 'src/other.ts', lineCount: 500, methodCount: 25, propertyCount: 5, importCount: 5, godScore: 80, rank: 'critical' },
    ],
    securityScore: {
      score: 60,
      grade: 'D',
      summary: { critical: 1, high: 1, medium: 0, low: 0, info: 0 },
      issues: [
        { type: 'critical', category: 'SQL Injection', filePath: 'src/changed.ts', lineNumber: 10, description: 'sql', codeSnippet: '', recommendation: '' },
        { type: 'high', category: 'XSS', filePath: 'src/other.ts', lineNumber: 20, description: 'xss', codeSnippet: '', recommendation: '' },
      ],
    },
  };

  const filtered = filterResultByChangedFiles(fullResult, parsed);
  assert.equal(filtered.summary.totalFiles, 4);
  assert.equal(filtered.godClasses.length, 1);
  assert.equal(filtered.godClasses[0].className, 'ChangedGod');
  assert.equal(filtered.securityScore.issues.length, 1);
  assert.equal(filtered.securityScore.issues[0].filePath, 'src/changed.ts');
  assert.equal(filtered.securityScore.summary.critical, 1);
  assert.equal(filtered.securityScore.summary.high, 0);
});

test('createOnSaveController: immediately re-evaluates ignore comments on file save', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-doctor-onsave-'));
  try {
    const fileA = path.join(tmpDir, 'service.ts');
    fs.writeFileSync(fileA, 'const x = eval(input);\n', 'utf8');

    let savedHandler = null;
    const diagnosticEntries = new Map();
    const diagnosticCollection = {
      clear: () => diagnosticEntries.clear(),
      set: (uri, diags) => diagnosticEntries.set(uri.fsPath, diags),
    };

    const vscodeMock = {
      Uri: { file: (p) => ({ fsPath: p }) },
      Range: class {
        constructor(sl, sc, el, ec) {
          this.start = { line: sl, character: sc };
          this.end = { line: el, character: ec };
        }
      },
      Diagnostic: class {
        constructor(range, message, severity) {
          this.range = range;
          this.message = message;
          this.severity = severity;
        }
      },
      DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
      workspace: {
        onDidSaveTextDocument: (fn) => {
          savedHandler = fn;
          return { dispose: () => {} };
        },
        getConfiguration: () => ({
          get: (_k, def) => def,
        }),
      },
    };

    const rawResult = {
      repoPath: tmpDir,
      summary: { totalFiles: 1, totalClasses: 0, criticalClasses: 0, avgGodScore: 0 },
      godClasses: [],
      securityScore: {
        score: 75,
        grade: 'C',
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        issues: [
          {
            type: 'critical',
            category: 'Code Injection',
            filePath: 'service.ts',
            lineNumber: 1,
            description: 'eval used',
            codeSnippet: 'const x = eval(input);',
            recommendation: 'Do not use eval',
          },
        ],
      },
    };

    setLastAnalysis('test-id', tmpDir, path.join(tmpDir, 'report.html'), undefined, rawResult);
    const controller = createOnSaveController(vscodeMock, {}, diagnosticCollection);

    // Add same-line ignore comment on line 1 and trigger save
    fs.writeFileSync(fileA, 'const x = eval(input); // code-doctor-ignore\n', 'utf8');
    savedHandler({
      uri: { scheme: 'file', fsPath: fileA },
    });

    const updatedState = getLastAnalysis();
    assert.equal(updatedState.result.securityScore.issues.length, 0);
    assert.equal(updatedState.result.securityScore.summary.critical, 0);
    assert.equal(diagnosticEntries.size, 0);

    controller.dispose();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
