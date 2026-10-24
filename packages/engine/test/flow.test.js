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

test('validation in an if condition, its else branch and a guard clause makes input clean', async () => {
  const php = `<?php
$id = $_GET['id'];
if (is_numeric($id)) {
  mysqli_query($c, "SELECT * FROM t WHERE id = " . $id);
}
if (!preg_match('/^\\d+$/', $_GET['n'])) {
  echo 'bad';
} else {
  $n = $_GET['n'];
  mysqli_query($c, "SELECT * FROM t WHERE n = " . $n);
}
$ip = $_GET['ip'];
if (!filter_var($ip, FILTER_VALIDATE_IP)) {
  die('invalid');
}
system('ping ' . $ip);
$loose = $_GET['q'];
if (preg_match('/\\d+/', $loose)) {
  mysqli_query($c, "SELECT * FROM t WHERE q = " . $loose);
}
mysqli_query($c, "SELECT * FROM t WHERE id = " . $id);
`;
  // An unanchored pattern validates nothing, and the check does not reach past its branch.
  assert.deepEqual(sinks(await analyzeFlows('php', php)), ['SQL Injection@19', 'SQL Injection@21']);

  const js = `function h(req) {
  const id = req.params.id;
  if (!Number.isInteger(Number(id)) || !/^\\d+$/.test(id)) {
    return;
  }
  db.query('SELECT * FROM t WHERE id = ' + id);
  const host = req.query.host;
  if (ALLOWED_HOSTS.includes(host)) fetch(host);
  fetch(host);
}`;
  assert.deepEqual(sinks(await analyzeFlows('typescript', js)), ['SSRF@9']);
});

test('SQL escaping only protects a value placed inside quotes', async () => {
  const php = `<?php
$id = mysqli_real_escape_string($c, $_POST['id']);
mysqli_query($c, "SELECT * FROM t WHERE id = '$id'");
mysqli_query($c, "SELECT * FROM t WHERE id = $id");
mysqli_query($c, "SELECT * FROM t WHERE id = '" . $id . "'");
mysqli_query($c, "SELECT * FROM t WHERE id = " . $id);
$q = "SELECT * FROM t WHERE name = '$id' AND id = $id";
mysqli_query($c, $q);
$x = isset($GLOBALS["link"]) ? mysqli_real_escape_string($GLOBALS["link"], $_GET['x']) : "";
mysqli_query($c, "SELECT * FROM t WHERE x = '$x'");
system('ls ' . escapeshellarg($id));
`;
  assert.deepEqual(sinks(await analyzeFlows('php', php)), ['SQL Injection@4', 'SQL Injection@6', 'SQL Injection@8']);
});

test('hash output is clean', async () => {
  const js = "function h(req) {\n  db.query(`SELECT * FROM u WHERE p = '${security.hash(req.body.password)}'`);\n  db.query(`SELECT * FROM u WHERE e = '${req.body.email}'`);\n}";
  assert.deepEqual(sinks(await analyzeFlows('typescript', js)), ['SQL Injection@3']);
  const php = "<?php\n$p = md5($_POST['p']);\nmysqli_query($c, \"SELECT * FROM u WHERE p = '$p'\");\n";
  assert.deepEqual(sinks(await analyzeFlows('php', php)), []);
});

test('flows through functions in the same file: parameters to sinks, arguments to return values', async () => {
  const js = `function findUser(id) {
  return db.query('SELECT * FROM users WHERE id = ' + id);
}
function runPing(host) {
  const cmd = 'ping ' + host;
  return exec(cmd);
}
function toNumber(value) {
  return parseInt(value);
}
function passThrough(value) {
  return value;
}
const currentId = () => req.query.id;
function handler(req, res) {
  findUser(req.params.id);
  runPing(toNumber(req.query.host));
  const target = passThrough(req.body.url);
  fetch(target);
  fetch(currentId());
  findUser(42);
}`;
  const flows = await analyzeFlows('typescript', js);
  assert.deepEqual(sinks(flows), ['SQL Injection@2', 'SSRF@19']);
  const sql = flows.find((flow) => flow.category === 'SQL Injection');
  assert.equal(sql.source.line, 16);
  assert.equal(sql.sink.line, 2);

  const php = `<?php
class OrderController {
  private function load($id) {
    return DB::select("SELECT * FROM orders WHERE id = " . $id);
  }
  private function shell($arg) {
    $safe = escapeshellarg($arg);
    system('convert ' . $safe);
  }
  public function show() {
    $this->load($_GET['id']);
    $this->shell($_GET['file']);
  }
}`;
  assert.deepEqual(sinks(await analyzeFlows('php', php)), ['SQL Injection@4']);
});

test('flows across files: imports, require, this-calls and unique names connect; packages and ambiguous names do not', async () => {
  const { buildFlowIndex, analyzeFileWithIndex } = require('../dist/analyzer/flow/project');
  const { FLOW_SPECS } = require('../dist/analyzer/flow/languages');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-project-'));
  const files = {
    'src/users.ts': "export function findUser(id: string) {\n  return db.query('SELECT * FROM users WHERE id = ' + id);\n}\nexport function safeUser(id: string) {\n  return db.query('SELECT * FROM users WHERE id = ?', [id]);\n}\n",
    'src/shell.js': "function run(cmd) {\n  return exec('sh -c ' + cmd);\n}\nmodule.exports = { run };\n",
    'src/fetcher.ts': "export function load(url) {\n  return fetch(url);\n}\n",
    'src/service.ts': "export class ReportService {\n  render(name: string) {\n    return eval(name);\n  }\n}\n",
    'src/dup-a.ts': "export function remove(p) { return unlinkSync(p); }\n",
    'src/dup-b.ts': "export function remove(p) { return rmSync(p); }\n",
    'src/routes.ts': [
      "import { findUser, safeUser as safe } from './users';",
      "import * as fetcher from './fetcher.js';",
      "import { render } from 'templating';",
      "const { run } = require('./shell');",
      'function handler(req, res, service) {',
      '  findUser(req.params.id);',
      '  safe(req.params.id);',
      '  fetcher.load(req.body.url);',
      '  run(req.query.cmd);',
      '  render(req.query.q);',
      '  this.reportService.render(req.query.name);',
      '  remove(req.query.path);',
      '}',
    ].join('\n'),
    'app/OrderRepository.php': "<?php\nclass OrderRepository {\n  public function loadOrder($id) {\n    return DB::select(\"SELECT * FROM orders WHERE id = \" . $id);\n  }\n}\n",
    'app/OrderController.php': "<?php\nclass OrderController {\n  public function show() {\n    $id = $_GET['id'];\n    return $this->orders->loadOrder($id);\n  }\n}\n",
  };
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    const project = Object.keys(files).map((name) => ({ path: path.join(dir, name), grammar: name.endsWith('.php') ? 'php' : name.endsWith('.ts') ? 'typescript' : 'javascript' }));
    const specsFor = (grammar) => [{ key: 'builtin', spec: FLOW_SPECS[grammar] }];
    const index = await buildFlowIndex(project, specsFor, async (file) => fs.readFileSync(file, 'utf8'));
    const flowsOf = async (name) => (await analyzeFileWithIndex(index, project.find((f) => f.path.endsWith(name)), files[name], specsFor)).get('builtin');

    const routes = await flowsOf('src/routes.ts');
    assert.deepEqual(routes.map((flow) => `${flow.category}@${flow.entry?.line}`), ['SQL Injection@6', 'SSRF@8', 'Command Injection@9', 'Code Injection@11']);
    const sql = routes[0];
    assert.equal(sql.source.line, 6);
    assert.equal(sql.sink.line, 2);
    assert.ok(sql.sink.file.endsWith('src/users.ts'));

    const php = await flowsOf('app/OrderController.php');
    assert.deepEqual(php.map((flow) => `${flow.category}@${flow.entry?.line}`), ['SQL Injection@5']);
    assert.ok(php[0].sink.file.endsWith('OrderRepository.php'));
    assert.equal(php[0].sink.line, 4);

    // The helper files report nothing on their own: their parameters are not input sources.
    assert.deepEqual(await flowsOf('src/users.ts'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('object access (BOLA): ownership evidence, owner-field filters and what does not count', async () => {
  const { analyzeAccess } = require('../dist/analyzer/flow/access');
  const js = `router.get('/orders/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);
  res.json(order);
});
router.get('/scoped/:id', async (req, res) => {
  const order = await Order.findOne({ where: { id: req.params.id, userId: req.user.id } });
  res.json(order);
});
router.get('/compared/:id', async (req, res) => {
  const order = await Order.findByPk(req.params.id);
  if (order.userId !== req.user.id) return res.sendStatus(403);
  res.json(order);
});
router.delete('/authorized/:id', async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: Number(req.params.id) } });
  await authorize(req.user, 'delete', order);
});
router.get('/role/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.sendStatus(403);
  res.json(await Order.findById(req.params.id));
});
router.get('/field/:id', async (req, res) => {
  res.json(await Order.findOne({ where: { id: req.params.id, UserId: req.body.UserId } }));
});
router.post('/login', async (req, res) => {
  res.json(await User.findOne({ where: { email: req.body.email } }));
});
router.patch('/payload/:id', async (req, res) => {
  await Review.update({ id: req.params.id }, { $set: { author: req.user.email } });
});`;
  const endpoints = await analyzeAccess('typescript', js);
  const summary = endpoints.map((e) => `${e.route}=${e.status}`);
  assert.deepEqual(summary, [
    'GET /orders/:id=owner_check_missing',
    'GET /scoped/:id=owner_checked',
    'GET /compared/:id=owner_checked',
    'DELETE /authorized/:id=owner_checked',
    'GET /role/:id=owner_check_missing',
    'GET /field/:id=owner_field_unverified',
    'PATCH /payload/:id=owner_check_missing',
  ]);
  assert.equal(endpoints[0].findings[0].sink.line, 2);
  assert.equal(endpoints[2].evidence.line, 11);

  const php = `<?php
$id = intval($_GET['user_id']);
if (isset($_COOKIE['uid']) && $id == intval($_COOKIE['uid'])) {
  $r = mysqli_query($c, "SELECT * FROM users WHERE user_id = $id");
}
$sessionUser = $_SESSION['user_id'];
if ($id == $sessionUser) {
  $stmt = mysqli_prepare($c, 'SELECT * FROM users WHERE user_id = ?');
  mysqli_stmt_bind_param($stmt, 'i', $id);
}`;
  const [file] = await analyzeAccess('php', php);
  // The session comparison makes the file count as checked even though the cookie path does not.
  assert.equal(file.status, 'owner_checked');
  assert.equal(file.evidence.line, 7);
  const [cookieOnly] = await analyzeAccess('php', php.split('$sessionUser')[0]);
  assert.equal(cookieOnly.status, 'owner_check_missing');

  const laravel = `<?php
class OrderController {
  public function show($request) {
    return Order::where('id', $request->route('id'))->where('user_id', auth()->id())->firstOrFail();
  }
  public function update($request) {
    return Order::where('id', $request->input('order_id'))->update(['user_id' => auth()->id()]);
  }
}`;
  assert.deepEqual((await analyzeAccess('php', laravel)).map((e) => `${e.function}=${e.status}`), ['show=owner_checked', 'update=owner_check_missing']);
});

test('object access rules compile from rule packs and report endpoints', async () => {
  const { analyzeAccessRules, analyzeTaintRules } = require('../dist/analyzer/flow/ruleTaint');
  const rule = compileTaintRule('BOLA', { type: 'object_access', languages: ['typescript'], owner_references: ['\\bsecurity\\.authenticatedUsers\\.from\\(req\\)'] });
  assert.equal(rule.kind, 'access');
  const code = `function h(req, res) {
  const user = security.authenticatedUsers.from(req);
  const basket = Basket.findOne({ where: { id: req.params.id } });
  if (basket.UserId !== user.id) return res.sendStatus(403);
}
function g(req) {
  return Basket.findOne({ where: { id: req.params.id } });
}`;
  const [endpoints] = await analyzeAccessRules([rule], 'typescript', 'a.ts', code);
  assert.deepEqual(endpoints.map((e) => `${e.function}=${e.status}`), ['h=owner_checked', 'g=owner_check_missing']);
  assert.deepEqual(await analyzeTaintRules([rule], 'typescript', 'a.ts', code), [null]);
  assert.throws(() => compileTaintRule('X', { type: 'object_access', languages: ['typescript'], owner_references: ['(a+)+'] }), /nested quantifiers/);
});

test('security file scan: file order, traced flows before patterns, test code marked, and the score built from the same issues', async () => {
  const { scanSecurityIssues } = require('../dist/analyzer/security/fileScan');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-filescan-'));
  try {
    fs.mkdirSync(path.join(dir, 'test'));
    fs.writeFileSync(path.join(dir, 'a.js'), "function h(req) {\n  eval('1');\n  child_process.exec(req.query.cmd);\n}\n");
    fs.writeFileSync(path.join(dir, 'test', 'b.test.js'), 'eval(input);\n');
    const files = [{ filePath: path.join(dir, 'a.js') }, { filePath: path.join(dir, 'test', 'b.test.js') }];
    const issues = await scanSecurityIssues(files, dir, 'typescript');
    assert.deepEqual(issues.map((i) => [path.basename(i.filePath), i.lineNumber, i.confidence ?? 'pattern', Boolean(i.inTest)]),
      [['a.js', 3, 'flow', false], ['a.js', 2, 'pattern', false], ['b.test.js', 1, 'pattern', true]]);
    const score = await calculateSecurityScore([{ language: 'typescript', files }], dir);
    assert.deepEqual(score.issues, issues);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
