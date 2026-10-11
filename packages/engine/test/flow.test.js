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
