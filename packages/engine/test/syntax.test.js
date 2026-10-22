const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SYNTAX_SPECS, parseWithSyntax } = require('../dist/analyzer/syntax');
const { isTestPath } = require('../dist/analyzer/security/testCode');
const { calculateSecurityScore } = require('../dist/analyzer/securityScore');

function withFile(name, content, use) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-syntax-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return Promise.resolve(use(file, dir)).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

const shape = (info) => info.classes.map((c) => ({ name: c.name, methods: [...c.methods].sort(), properties: c.propertyCount, constructor: c.constructorExists }));

const CASES = {
  go: ['a.go', `package a
import (
  "fmt"
  "os/exec"
)
// Store keeps users.
type Store struct { users map[string]string; a, b int }
func NewStore() *Store { return &Store{} }
func (s *Store) Get(id string) string { return s.users[id] }
func (s Store) Count() int { return len(s.users) }
func helper(a, b int, c string) {}
`, {
    imports: ['fmt', 'os/exec'],
    classes: [{ name: 'Store', methods: ['Count', 'Get'], properties: 3, constructor: true }],
    functions: [['NewStore', 0], ['helper', 3]],
  }],
  python: ['a.py', `import os, sys as system
from collections import OrderedDict

class Repo(Base):
    kind = "repo"
    def __init__(self, path):
        self.path = path
        self.items = []
    def load(self, name, *, cache=True):
        class Local:
            pass
        return name

def main(argv):
    pass
`, {
    imports: ['os', 'sys', 'collections'],
    classes: [{ name: 'Repo', methods: ['__init__', 'load'], properties: 3, constructor: true }, { name: 'Local', methods: [], properties: 0, constructor: false }],
    functions: [['main', 1]],
  }],
  java: ['A.java', `package a;
import java.util.List;
import static java.lang.Math.max;
public class Account {
  private final String id, owner;
  public Account(String id) { this.id = id; this.owner = ""; }
  public String id() { return id; }
  interface Listener { void changed(); }
}
`, {
    imports: ['java.util.List', 'java.lang.Math.max'],
    classes: [{ name: 'Account', methods: ['Account', 'id'], properties: 2, constructor: true }, { name: 'Listener', methods: ['changed'], properties: 0, constructor: false }],
    functions: [],
  }],
  csharp: ['A.cs', `using System;
using System.Collections.Generic;
namespace App {
  public class Order {
    private int count;
    public string Name { get; set; }
    public Order() {}
    public void Add(int n) { count += n; }
  }
}
`, {
    imports: ['System', 'System.Collections.Generic'],
    classes: [{ name: 'Order', methods: ['Add', 'Order'], properties: 2, constructor: true }],
    functions: [],
  }],
  rust: ['a.rs', `use std::collections::HashMap;
pub struct Cache { map: HashMap<String, String>, hits: u64 }
impl Cache {
    pub fn new() -> Self { Cache { map: HashMap::new(), hits: 0 } }
    pub fn get(&mut self, key: &str) -> Option<&String> { self.map.get(key) }
}
impl<T: Clone> Helper for T { fn help(&self) {} }
fn main() {}
`, {
    imports: ['std::collections::HashMap'],
    classes: [{ name: 'Cache', methods: ['get', 'new'], properties: 2, constructor: true }],
    functions: [['help', 0], ['main', 0]],
  }],
  cpp: ['a.cpp', `#include <string>
#include "widget.h"
namespace ui {
class Widget {
 public:
  Widget(int w);
  int width() const { return w_; }
  void draw();
 private:
  int w_, h_;
};
void Widget::draw() {}
void detail::log(const char* m) {}
}
`, {
    imports: ['string', 'widget.h'],
    classes: [{ name: 'Widget', methods: ['Widget', 'draw', 'width'], properties: 2, constructor: true }],
    functions: [['log', 1]],
  }],
};

for (const [language, [fileName, source, expected]] of Object.entries(CASES)) {
  test(`${language}: syntax tree structure`, () => withFile(fileName, source, async (file) => {
    const info = await parseWithSyntax(SYNTAX_SPECS[language], file);
    assert.deepEqual(info.imports, expected.imports);
    assert.deepEqual(shape(info), expected.classes);
    assert.deepEqual(info.functions.map((fn) => [fn.name, fn.paramCount]), expected.functions);
  }));
}

test('security: comments, plain strings and constant-only calls are not findings', () => withFile('main.go', `package main
import (
  "math/rand"
  "os/exec"
)
// exec.Command(userInput) in a comment
const doc = "call exec.Command(x) to run"
func run(cmd string) {
  exec.Command("git", "status")
  exec.Command(cmd)
  _ = rand.Int()
}
`, async (file, dir) => {
  const result = await calculateSecurityScore([{ language: 'go', files: [{ filePath: file }] }], dir);
  const found = result.issues.map((issue) => `${issue.category}:${issue.lineNumber}`).sort();
  assert.deepEqual(found, ['Command Injection:10', 'Weak Randomness:3']);
}));

test('security: findings in test code are listed but not scored', () => withFile('run_test.go', 'package main\nimport "os/exec"\nfunc T(c string) { exec.Command(c) }\n', async (file, dir) => {
  const result = await calculateSecurityScore([{ language: 'go', files: [{ filePath: file }] }], dir);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].inTest, true);
  assert.equal(result.summary.high, 0);
  assert.equal(result.overallScore, 100);
}));

test('test code is recognised by directory and file name conventions', () => {
  for (const testPath of ['pkg/run_test.go', 'tests/test_api.py', 'src/test/java/AppTest.java', 'web/__tests__/a.ts', 'lib/a.spec.ts', 'App.Tests/OrderTests.cs']) {
    assert.equal(isTestPath(testPath), true, testPath);
  }
  for (const productionPath of ['src/main.go', 'contest/app.py', 'src/latest.ts', 'testimony/a.rs']) {
    assert.equal(isTestPath(productionPath), false, productionPath);
  }
});

test('TypeScript files with generic arrow functions parse; JSX stays enabled for JSX-capable files', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { parseFile } = require('../dist/analyzer/typescript/ast');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-jsx-'));
  try {
    fs.writeFileSync(path.join(dir, 'generic.ts'), 'export const wrap = <T>(value: T) => value;\nexport function f() { return wrap(1); }\n');
    fs.writeFileSync(path.join(dir, 'view.tsx'), 'export function View() { return <div>hi</div>; }\n');
    const generic = await parseFile(path.join(dir, 'generic.ts'));
    const view = await parseFile(path.join(dir, 'view.tsx'));
    assert.deepEqual(generic.functions.map((f) => f.name), ['f']);
    assert.deepEqual(view.functions.map((f) => f.name), ['View']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
