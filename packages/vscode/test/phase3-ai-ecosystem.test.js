const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  listVsCodeLmModels,
  sendVsCodeLmPrompt,
  runVsCodeLmReview,
} = require('../lib/vscodeLm');
const {
  extractCodeBlock,
  buildAiFixPrompt,
  setPreviewContent,
  getPreviewContent,
  previewAndApplyAiFix,
} = require('../lib/aiFixPreview');
const {
  CHAT_PARTICIPANT_ID,
  buildChatContextSummary,
  handleChatRequest,
  registerChatParticipant,
} = require('../lib/chatParticipant');
const { setLastAnalysis } = require('../lib/lastAnalysisState');
const { analyzeWorkspace } = require('../lib/analyzer');

function createAsyncTextStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) {
        yield c;
      }
    },
  };
}

test('listVsCodeLmModels and sendVsCodeLmPrompt: integrates with vscode.lm without API keys', async () => {
  const vscodeMock = {
    LanguageModelChatMessage: {
      User: (content) => ({ role: 'user', content }),
    },
    lm: {
      selectChatModels: async () => [
        {
          id: 'copilot-gpt-4o',
          name: 'GPT-4o',
          vendor: 'copilot',
          sendRequest: async (messages) => {
            assert.equal(messages.length, 1);
            return {
              text: createAsyncTextStream(['### Structural Review\n', 'All good!']),
            };
          },
        },
      ],
    },
  };

  const models = await listVsCodeLmModels(vscodeMock);
  assert.equal(models.length, 1);
  assert.equal(models[0].id, 'copilot-gpt-4o');
  assert.match(models[0].label, /GPT-4o/);

  const res = await sendVsCodeLmPrompt(vscodeMock, 'Review this repository', 'copilot-gpt-4o');
  assert.equal(res.modelId, 'copilot-gpt-4o');
  assert.equal(res.text, '### Structural Review\nAll good!');
});

test('runVsCodeLmReview: runs engine prompt through vscode.lm and patches saved HTML report', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-doctor-vscodelm-'));
  try {
    const repoDir = path.join(tmpDir, 'repo');
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'sample.ts'), 'export class Demo { run() { return 1; } }\n', 'utf8');

    const analysis = await analyzeWorkspace(repoDir, 'typescript', outDir, 'en');
    const vscodeMock = {
      LanguageModelChatMessage: {
        User: (content) => ({ role: 'user', content }),
      },
      lm: {
        selectChatModels: async () => [
          {
            id: 'copilot-claude-sonnet',
            name: 'Claude Sonnet',
            vendor: 'copilot',
            sendRequest: async () => ({
              text: createAsyncTextStream(['## VS Code LM Review\n\nClean architecture verified.']),
            }),
          },
        ],
      },
    };

    const reviewRes = await runVsCodeLmReview(vscodeMock, {
      analysisId: analysis.analysisId,
      outputDir: outDir,
      displayLanguage: 'en',
    });

    assert.equal(reviewRes.modelId, 'copilot-claude-sonnet');
    assert.match(reviewRes.result, /Clean architecture verified/);
    const reportHtml = fs.readFileSync(analysis.reportPath, 'utf8');
    assert.match(reportHtml, /Clean architecture verified/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('extractCodeBlock and previewAndApplyAiFix: opens vscode.diff and applies WorkspaceEdit on confirmation', async () => {
  assert.equal(
    extractCodeBlock('Here is the fix:\n```typescript\nconst safe = 1;\n```\n'),
    'const safe = 1;\n'
  );

  const prompt = buildAiFixPrompt({
    filePath: '/workspace/db.ts',
    fileContent: 'db.query(input);\n',
    issueCategory: 'SQL Injection',
    issueDescription: 'Unsanitized SQL query',
    lineOneBased: 1,
    displayLanguage: 'en',
  });
  assert.match(prompt, /SQL Injection/);
  assert.match(prompt, /db\.query\(input\)/);

  let diffOpened = null;
  let appliedEdit = null;
  let savedDoc = false;

  const docUri = { fsPath: '/workspace/db.ts' };
  const document = {
    uri: docUri,
    lineCount: 1,
    getText: () => 'db.query(input);\n',
    save: async () => {
      savedDoc = true;
    },
  };

  const vscodeMock = {
    Uri: {
      parse: (s) => ({ toString: () => s, path: '/workspace/db.ts' }),
    },
    Range: class {
      constructor(sl, sc, el, ec) {
        this.start = { line: sl, character: sc };
        this.end = { line: el, character: ec };
      }
    },
    WorkspaceEdit: class {
      constructor() {
        this.replacements = [];
      }
      replace(uri, range, text) {
        this.replacements.push({ uri, range, text });
      }
    },
    ProgressLocation: { Notification: 15 },
    LanguageModelChatMessage: {
      User: (content) => ({ role: 'user', content }),
    },
    lm: {
      selectChatModels: async () => [
        {
          id: 'copilot-gpt-4o',
          sendRequest: async () => ({
            text: createAsyncTextStream(['```ts\ndb.query("SELECT * FROM t WHERE id = ?", [input]);\n```']),
          }),
        },
      ],
    },
    commands: {
      executeCommand: async (cmd, left, right, title) => {
        if (cmd === 'vscode.diff') {
          diffOpened = { left, right, title };
        }
      },
    },
    window: {
      activeTextEditor: {
        document,
        selection: { isEmpty: true, active: { line: 0 } },
      },
      withProgress: async (_opts, task) => task({}, {}),
      showInformationMessage: async (_msg, applyBtn) => applyBtn,
      showErrorMessage: () => {},
    },
    workspace: {
      getConfiguration: () => ({
        get: (k, def) => (k === 'llmProvider' ? 'vscode-lm' : def),
      }),
      applyEdit: async (edit) => {
        appliedEdit = edit;
        return true;
      },
    },
  };

  const applied = await previewAndApplyAiFix(vscodeMock, { secrets: { get: async () => undefined } }, { documentUri: docUri });
  assert.equal(applied, true);
  assert.ok(diffOpened);
  assert.match( getPreviewContent('/workspace/db.ts'), /SELECT \* FROM t WHERE id = \?/);
  assert.equal(appliedEdit.replacements.length, 1);
  assert.equal(savedDoc, true);
});

test('chatParticipant (@codedoctor): summarizes analysis and answers security/refactor/fix queries', async () => {
  const sampleAnalysis = {
    analysisId: 'chat-test-id',
    outputDir: '/tmp',
    reportPath: '/tmp/report.html',
    summary: {
      analysisId: 'chat-test-id',
      repoPath: '/workspace',
      reportPath: '/tmp/report.html',
      filesAnalyzed: 5,
      classesAnalyzed: 2,
      criticalGodClasses: 1,
      circularDependencies: 1,
      technicalDebt: { score: 82, grade: 'B' },
      security: { score: 75, grade: 'C', critical: 1, high: 0, medium: 0, low: 0 },
      failures: [],
    },
    result: {
      repoPath: '/workspace',
      summary: { totalFiles: 5, totalClasses: 2, criticalClasses: 1, avgGodScore: 85 },
      godClasses: [
        {
          className: 'OrderManager',
          filePath: 'src/order.ts',
          lineCount: 650,
          methodCount: 35,
          propertyCount: 12,
          importCount: 9,
          godScore: 92,
          rank: 'critical',
        },
      ],
      circularDependencies: [{ cycle: ['a.ts', 'b.ts', 'a.ts'], severity: 'high' }],
      securityScore: {
        score: 75,
        grade: 'C',
        summary: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        issues: [
          {
            type: 'critical',
            category: 'SQL Injection',
            confidence: 'flow',
            filePath: 'src/order.ts',
            lineNumber: 42,
            description: 'Tainted SQL query',
            codeSnippet: 'db.query(sql)',
            recommendation: 'Use prepared statements',
            flow: {
              source: { line: 40, code: 'req.query.id' },
              steps: [],
              sink: { line: 42, code: 'db.query(sql)' },
            },
          },
        ],
      },
    },
  };

  setLastAnalysis(
    sampleAnalysis.analysisId,
    sampleAnalysis.outputDir,
    sampleAnalysis.reportPath,
    sampleAnalysis.summary,
    sampleAnalysis.result
  );

  const ctxSummary = buildChatContextSummary(sampleAnalysis, '/workspace/src/order.ts');
  assert.match(ctxSummary, /TRACED FLOW/);
  assert.match(ctxSummary, /OrderManager/);

  const markdownOut = [];
  const buttonsOut = [];
  const stream = {
    markdown: (m) => markdownOut.push(m),
    progress: () => {},
    button: (b) => buttonsOut.push(b),
  };

  let registeredId = null;
  const vscodeMock = {
    LanguageModelChatMessage: {
      User: (content) => ({ role: 'user', content }),
    },
    lm: {
      selectChatModels: async () => [
        {
          id: 'copilot-gpt-4o',
          sendRequest: async () => ({
            text: createAsyncTextStream(['Use parameterized queries to fix the SQL injection on line 42.']),
          }),
        },
      ],
    },
    window: {
      activeTextEditor: {
        document: { uri: { fsPath: '/workspace/src/order.ts' }, getText: () => '' },
        selection: { isEmpty: true },
      },
    },
    workspace: {
      getConfiguration: () => ({
        get: (k, def) => (k === 'llmProvider' ? 'vscode-lm' : def),
      }),
    },
    chat: {
      createChatParticipant: (id) => {
        registeredId = id;
        return { dispose: () => {} };
      },
    },
  };

  const sub = registerChatParticipant(vscodeMock, {});
  assert.equal(registeredId, CHAT_PARTICIPANT_ID);
  sub.dispose();

  await handleChatRequest(
    vscodeMock,
    { secrets: { get: async () => undefined } },
    { command: 'security', prompt: 'How do I fix the SQL injection?' },
    stream
  );

  assert.match(markdownOut.join('\n'), /parameterized queries/);
});

