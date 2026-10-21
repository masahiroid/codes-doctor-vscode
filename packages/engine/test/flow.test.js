const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { analyzeFlows } = require('../dist/analyzer/flow/taint');
const { calculateSecurityScore } = require('../dist/analyzer/securityScore');

const sinks = (flows) => flows.map((flow) => `${flow.category}@${flow.sink.line}`);

const CASES = {
  javascript: [`function handler(req, res) {
  const name = req.query.name;
  const cmd = 'ls ' + name;
  child_process.exec(cmd);
  const id = parseInt(req.query.id);
  db.query('SELECT * FROM t WHERE id = ' + id);
  db.query('SELECT * FROM t WHERE name = ?', [name]);
}`, ['Command Injection@4']],
  python: [`def view(request):
    path = request.args.get('p')
    open(path)
    n = int(request.args.get('n'))
    cursor.execute("SELECT %d" % n)
    q = request.args.get('q')
    q = 'fixed'
    cursor.execute("SELECT " + q)
`, ['Path Traversal@3']],
  php: [`<?php
$file = $_GET['f'];
include($file);
$arg = escapeshellarg($_GET['a']);
system('ls ' . $arg);
`, ['Path Traversal@3']],
  go: [`package main
func h(w http.ResponseWriter, r *http.Request) {
  q := r.URL.Query().Get("q")
  db.QueryContext(ctx, "SELECT * FROM t WHERE q = '" + q + "'")
  n, _ := strconv.Atoi(q)
  db.Query("SELECT ?", n)
  cmd.execute(q)
}`, ['SQL Injection@4']],
};

for (const [grammar, [source, expected]] of Object.entries(CASES)) {
  test(`flow (${grammar}): input reaching a sink is traced, sanitized or constant input is not`, async () => {
    assert.deepEqual(sinks(await analyzeFlows(grammar, source)), expected);
  });
}

test('flow: the path records the source, the steps between and the sink', async () => {
  const [flow] = await analyzeFlows('javascript', CASES.javascript[0]);
  assert.equal(flow.source.line, 2);
  assert.deepEqual(flow.steps.map((step) => step.line), [3]);
  assert.equal(flow.sink.line, 4);
});

test('security: a traced flow is confirmed, an untraced pattern match is downgraded', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-flow-'));
  try {
    const file = path.join(dir, 'app.js');
    fs.writeFileSync(file, `function a(req) { child_process.exec('ls ' + req.query.d); }
function b(dir) { child_process.exec('ls ' + dir); }
`);
    const result = await calculateSecurityScore([{ language: 'typescript', files: [{ filePath: file }] }], dir);
    const confirmed = result.issues.filter((issue) => issue.confidence === 'flow');
    const untraced = result.issues.filter((issue) => issue.confidence === 'pattern');
    assert.deepEqual(confirmed.map((issue) => issue.lineNumber), [1]);
    assert.ok(confirmed[0].flow);
    assert.deepEqual(untraced.map((issue) => [issue.lineNumber, issue.type]), [[2, 'low']]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('llm context: traced flows carry their path and callers, pattern matches are grouped, test code is left out', () => {
  const { buildSecurityContext } = require('../dist/llm/context/securityContext');
  const repo = path.join(os.tmpdir(), 'repo');
  const flow = { source: { line: 2, code: 'a = req.query.a' }, steps: [], sink: { line: 3, code: 'exec(a)' }, function: 'run' };
  const issue = (fields) => ({ type: 'low', description: '', recommendation: '', filePath: path.join(repo, 'src/app.js'), lineNumber: 1, ...fields });
  const context = buildSecurityContext({
    overallScore: 59, grade: 'F', categoryBreakdown: [], explanation: '', topRisks: [],
    summary: { critical: 1, high: 0, medium: 0, low: 2, info: 0 },
    issues: [
      issue({ type: 'critical', category: 'Command Injection', lineNumber: 3, confidence: 'flow', flow }),
      issue({ category: 'Command Injection', lineNumber: 8, confidence: 'pattern' }),
      issue({ category: 'Command Injection', lineNumber: 9, confidence: 'pattern' }),
      issue({ type: 'medium', category: 'Weak Cryptography', lineNumber: 4 }),
      issue({ type: 'high', category: 'Hardcoded Secrets', inTest: true }),
    ],
  }, { nodes: [], edges: [{ from: 'main', to: 'run', filePath: '' }, { from: 'run', to: 'run', filePath: '' }] }, repo);

  assert.equal(context.testFindings, 1);
  assert.deepEqual(context.tracedFlows, [{
    category: 'Command Injection', severity: 'critical', file: path.join('src', 'app.js'), function: 'run', callers: ['main'],
    path: [{ role: 'input', line: 2, code: 'a = req.query.a' }, { role: 'sink', line: 3, code: 'exec(a)' }],
  }]);
  assert.deepEqual(context.untracedPatterns, [{ category: 'Command Injection', count: 2, examples: [path.join('src', 'app.js') + ':8', path.join('src', 'app.js') + ':9'] }]);
  assert.deepEqual(context.otherFindings.map((finding) => finding.category), ['Weak Cryptography']);
});

const { compileTaintRule, analyzeTaintRule } = require('../dist/analyzer/flow/ruleTaint');

test('distributed taint rules reuse built-in sinks and add their own sources, sanitizers and sinks', async () => {
  const sql = compileTaintRule('EMERG-SQLI', { type: 'taint', languages: ['typescript', 'php'], sinks: [{ builtin: 'SQL Injection' }] });
  const js = `function h(req) {
  const id = req.params.id;
  db.query('SELECT * FROM t WHERE id = ' + id);
  child_process.exec('ls ' + id);
}`;
  assert.deepEqual(sinks(await analyzeTaintRule(sql, 'typescript', 'a.ts', js)), ['SQL Injection@3']);
  assert.deepEqual(sinks(await analyzeTaintRule(sql, 'javascript', 'a.js', js)), ['SQL Injection@3']);
  assert.deepEqual(sinks(await analyzeTaintRule(sql, 'php', 'a.php', `<?php\n$id = $_GET['id'];\nmysqli_query($c, $id);\n`)), ['SQL Injection@3']);
  assert.deepEqual(sinks(await analyzeTaintRule(sql, 'php', 'a.php', `<?php\n$id = $_GET['id'];\n$pdo->query("SELECT " . $id);\n`)), ['SQL Injection@3']);
  assert.equal(await analyzeTaintRule(sql, 'python', 'a.py', 'x = 1'), null);

  const custom = compileTaintRule('EMERG-CUSTOM', {
    type: 'taint', languages: ['typescript'], builtin_sources: false,
    sources: ['\\bevent\\.body\\b'], sanitizers: ['assertOwner'], sinks: [{ callee: 'repo\\.find(?:One|ById)', argument: 0 }],
  });
  const lambda = `async function handler(event) {
  const id = event.body;
  await repo.findById(id);
  const safe = assertOwner(event.body);
  await repo.findOne(safe);
  await repo.findById(req.query.id);
}`;
  const flows = await analyzeTaintRule(custom, 'typescript', 'h.ts', lambda);
  assert.deepEqual(sinks(flows), ['EMERG-CUSTOM@3']);
  assert.equal(flows[0].source.line, 2);
});

test('unsafe or malformed distributed taint rules are rejected', () => {
  assert.throws(() => compileTaintRule('X', { type: 'taint', languages: ['typescript'], sinks: [{ callee: '(a+)+' }] }), /nested quantifiers/);
  assert.throws(() => compileTaintRule('X', { type: 'taint', languages: ['typescript'], sinks: [{ builtin: 'Nope' }] }), /unknown builtin/);
  assert.throws(() => compileTaintRule('X', { type: 'taint', languages: ['cobol'], sinks: [{ builtin: 'XSS' }] }), /support flow analysis/);
  assert.throws(() => compileTaintRule('X', { type: 'regex' }), /unsupported detect type/);
  assert.throws(() => compileTaintRule('X', { type: 'taint', languages: ['typescript'], sinks: [{ callee: '(' }] }), /Invalid regular expression/);
});

test('PHP object and static SQL calls are sinks', async () => {
  const php = `<?php
$id = $_GET['id'];
$pdo->query("SELECT * FROM t WHERE id = " . $id);
DB::select("SELECT * FROM t WHERE id = $id");
$q->whereRaw("id = " . $id);
$pdo->prepare("SELECT * FROM t WHERE id = ?");
`;
  assert.deepEqual(sinks(await analyzeFlows('php', php)), ['SQL Injection@3', 'SQL Injection@4', 'SQL Injection@5']);
});

test('several distributed rules share one parse and keep their order', async () => {
  const { analyzeTaintRules } = require('../dist/analyzer/flow/ruleTaint');
  const sql = compileTaintRule('SQL', { type: 'taint', languages: ['typescript'], sinks: [{ builtin: 'SQL Injection' }] });
  const php = compileTaintRule('PHP', { type: 'taint', languages: ['php'], sinks: [{ builtin: 'SQL Injection' }] });
  const ssrf = compileTaintRule('SSRF', { type: 'taint', languages: ['typescript'], sinks: [{ builtin: 'SSRF' }] });
  const code = 'function h(req) {\n  db.query("x" + req.query.a);\n  fetch(req.body.u);\n}';
  const [a, b, c] = await analyzeTaintRules([sql, php, ssrf], 'typescript', 'a.ts', code);
  assert.deepEqual([sinks(a), b, sinks(c)], [['SQL Injection@2'], null, ['SSRF@3']]);
});

test('PHP procedural SQL calls check the query after the connection', async () => {
  const php = `<?php
$id = $_REQUEST['id'];
$query = "SELECT * FROM users WHERE user_id = '$id'";
$result = mysqli_query($GLOBALS["link"], $query);
pg_query("SELECT * FROM t WHERE id = " . $_GET['n']);
mysqli_query($link, "SELECT 1");
`;
  assert.deepEqual(sinks(await analyzeFlows('php', php)), ['SQL Injection@4', 'SQL Injection@5']);
});
