const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const ja = require('../dist').securityRules;
const en = require('../dist-en').securityRules;

const RAW = {
  id: 'R1', title: '【緊急】SQL "注入"', severity: 'error', excel_mapping: { column: '列', action_required: '要対応' },
  target_languages: ['typescript'], category: 'c', message: 'm\nx', source_urls: ['https://e.x/'], check_steps: ['手順'], n: 3, b: true, z: null,
};

function pack(id, version, rules, channel = 'emergency') {
  const entry = { id, version, channel, mandatory: true, file: `${id}.json`, sha256: '' };
  const bytes = Buffer.from(JSON.stringify({ id, version, rules }));
  entry.sha256 = ja.sha256Hex(bytes);
  return ja.parsePack(bytes, entry);
}
const rule = (id, extra = {}) => ({ ...RAW, id, title: `T ${id}`, ...extra });

function report(packs, statuses = {}) {
  return {
    generatedAt: '2026-11-14T00:00:00.000Z', toolName: 'Codes Doctor', toolVersion: 'test', rulesetVersion: '9',
    rules: packs.flatMap((p) => p.rules.map((r) => ({
      packId: p.id, packVersion: p.version, ruleId: r.id, ruleSha256: ja.ruleDigest(r), title: r.title, category: r.category, severity: r.severity,
      excelColumn: r.excelColumn, actionRequired: r.actionRequired, method: statuses[r.id] ? 'dataflow' : 'manual',
      status: statuses[r.id] ?? 'manual_check_required', candidateCount: statuses[r.id] === 'flow_detected' ? 1 : 0,
      locations: statuses[r.id] === 'flow_detected' ? [{ file: 'a.ts', line: 3, source: '=cmd()', sourceLine: 2, sink: 'db.query(q)' }] : [],
    }))),
  };
}

test('rule digests match security-rules (Python json.dumps, sorted keys, indent 2)', () => {
  const [parsed] = pack('p', '1', [RAW]).rules;
  assert.equal(ja.ruleDigest(parsed), 'd0eb82e63a05d19b7a148e44490a9a0a935fcc7673666576d425218d236029ab');
  assert.equal(parsed.fixStatus, undefined);
  assert.equal(pack('p', '1', [{ ...RAW, fix_status: 'released' }]).rules[0].fixStatus, 'released');
});

test('evidence: created pending, kept while current, reset with the old review when the rule changes', () => {
  const v1 = [pack('em', '1', [rule('A'), rule('B')]), pack('base', '1', [rule('C')], 'baseline')];
  const first = ja.updateEvidence(v1, undefined, 'svc/prod', report(v1, { A: 'flow_detected' }));
  assert.deepEqual(first.added, ['em/A', 'em/B', 'base/C']);
  assert.equal(first.evidence.target, 'svc/prod');
  const a = first.evidence.results[0];
  assert.equal(a.status, 'pending');
  assert.deepEqual(a.analysis.locations, ['a.ts:3']);
  assert.equal(a.analysis.status, 'flow_detected');

  for (const entry of first.evidence.results) Object.assign(entry, { status: 'pass', reviewer: 'r', evidence: ['ref'], checked_at: '2026-11-13T00:00:00+09:00' });
  // Only the emergency pack is updated: B changes, A stays, a new rule D appears; the baseline entry is untouched.
  const v2 = [pack('em', '1', [rule('A'), rule('B', { message: 'changed' }), rule('D')])];
  const second = ja.updateEvidence(v2, first.evidence, 'svc/prod');
  assert.deepEqual(second.invalidated, ['em/B']);
  assert.deepEqual(second.added, ['em/D']);
  const byId = Object.fromEntries(second.evidence.results.map((entry) => [entry.rule_id, entry]));
  assert.equal(byId.A.status, 'pass');
  assert.equal(byId.B.status, 'pending');
  assert.deepEqual(byId.B.superseded, { pack_version: '1', rule_sha256: ja.ruleDigest(v1[0].rules[1]), status: 'pass', checked_at: '2026-11-13T00:00:00+09:00', reviewer: 'r' });
  assert.equal(byId.C.status, 'pass');

  const third = ja.updateEvidence([pack('em', '2', [rule('A')])], second.evidence, 'svc/prod');
  assert.deepEqual(third.invalidated, ['em/A']);
  assert.deepEqual(third.removed.sort(), ['em/B', 'em/D']);
  assert.throws(() => ja.updateEvidence(v1, first.evidence, 'other/prod'), /not "other\/prod"/);
  assert.throws(() => ja.updateEvidence(v1, undefined, ' '), /target/);
});

test('evidence check follows rules.py check and warns when a pass contradicts a detected flow', () => {
  const packs = [pack('em', '1', [rule('A'), rule('B')])];
  const now = new Date('2026-11-14T00:00:00Z');
  const { evidence } = ja.updateEvidence(packs, undefined, 't');
  assert.deepEqual(ja.checkEvidence(packs, evidence, 't', now).failures, ['em/A: review incomplete (pending)', 'em/B: review incomplete (pending)']);
  const [a, b] = evidence.results;
  Object.assign(a, { status: 'pass', reviewer: 'r', evidence: ['ref'], checked_at: '2026-11-13T09:00:00+09:00' });
  Object.assign(b, { status: 'not_applicable', reviewer: 'r', evidence: ['ref'], checked_at: '2026-11-13T00:00:00Z', reason: 'no API' });
  assert.deepEqual(ja.checkEvidence(packs, evidence, 't', now), { failures: [], warnings: [] });
  assert.deepEqual(ja.checkEvidence(packs, evidence, 't', now, report(packs, { A: 'flow_detected' })).warnings, ['em/A: marked pass, but the analysis found 1 (flow_detected)']);
  assert.deepEqual(ja.checkEvidence(packs, evidence, 'u', now).failures, ['evidence target mismatch']);

  const broken = structuredClone(evidence);
  Object.assign(broken.results[0], { evidence: [' '], reviewer: '', checked_at: '2026-11-13T00:00:00' });
  Object.assign(broken.results[1], { reason: '', checked_at: '2026-10-01T00:00:00Z' });
  assert.deepEqual(ja.checkEvidence(packs, broken, 't', now).failures, [
    'em/A: evidence references required', 'em/A: reviewer required', 'em/A: checked_at must be within the last 30 days with timezone',
    'em/B: non-applicability reason required', 'em/B: checked_at must be within the last 30 days with timezone',
  ]);
  const future = structuredClone(evidence);
  future.results[0].checked_at = '2026-11-15T00:00:00Z';
  future.results.push(structuredClone(future.results[1]));
  assert.deepEqual(ja.checkEvidence(packs, future, 't', now).failures, ['duplicate evidence: em/B', 'em/A: checked_at must be within the last 30 days with timezone']);
  assert.deepEqual(ja.checkEvidence([pack('em', '2', [rule('A')])], evidence, 't', now).failures, ['em/A: missing or outdated evidence']);
  assert.throws(() => ja.parseEvidence('[]'), /not an object/);
  assert.throws(() => ja.parseEvidence('{"target":"t"}'), /results/);
});

test('ruleset changes: packs and rules added, changed, removed, and fixes released', () => {
  const before = [pack('em', '1', [rule('A', { fix_status: 'draft' }), rule('B'), rule('C')]), pack('old', '1', [rule('X')])];
  const after = [pack('em', '2', [rule('A', { fix_status: 'released' }), rule('B', { message: 'new' }), rule('D')]), pack('new', '1', [rule('N', { fix_status: 'released' })], 'baseline')];
  const changes = ja.compareRulesets(before, after);
  const ids = (list) => list.map((item) => `${item.packId}/${item.ruleId}`);
  assert.deepEqual(changes.updatedPacks, [{ id: 'em', from: '1', to: '2', channel: 'emergency' }]);
  assert.deepEqual(changes.addedPacks.map((p) => p.id), ['new']);
  assert.deepEqual(changes.removedPacks.map((p) => p.id), ['old']);
  assert.deepEqual(ids(changes.addedRules), ['em/D', 'new/N']);
  assert.deepEqual(ids(changes.changedRules), ['em/A', 'em/B']);
  assert.deepEqual(ids(changes.removedRules), ['em/C', 'old/X']);
  assert.deepEqual(changes.fixReleased.map((item) => [item.ruleId, item.from]), [['A', 'draft'], ['N', undefined]]);
  assert.equal(ja.hasRulesetChanges(ja.compareRulesets(after, after)), false);
  // A first download is all additions, but nothing was "released" relative to a known state.
  assert.deepEqual(ja.compareRulesets(undefined, after).fixReleased, []);
});

/** Entries of a stored ZIP archive, with their CRC checked. */
function unzip(buffer) {
  const files = {};
  for (let offset = 0; buffer.readUInt32LE(offset) === 0x04034b50;) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const data = buffer.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    assert.equal(zlib.crc32(data), buffer.readUInt32LE(offset + 14), name);
    files[name] = data.toString('utf8');
    offset += 30 + nameLength + size;
  }
  return files;
}

test('management sheet: localized labels, review status, formula escape in CSV and Excel', () => {
  const packs = [pack('em', '1', [rule('A'), rule('B')])];
  const rep = report(packs, { A: 'flow_detected' });
  const { evidence } = ja.updateEvidence(packs, undefined, 't', rep);
  Object.assign(evidence.results[1], { status: 'pass', reviewer: '=HYPERLINK("x")', evidence: ['ref'], checked_at: '2026-11-13T00:00:00Z' });
  const rows = ja.submissionRows(rep, evidence);
  assert.deepEqual(rows[0].slice(0, 4), ['分類', 'パック', 'ルールID', '項目名']);
  assert.deepEqual(rows[1].slice(7, 12), ['入力の到達あり', 1, 'a.ts:3', '未着手', '要対応']);
  assert.deepEqual(rows[2].slice(10, 12), ['手動確認済み', '不要']);
  assert.deepEqual(en.submissionRows(rep, evidence)[0].slice(0, 4), ['Classification', 'Pack', 'Rule ID', 'Item']);

  const csv = ja.submissionCsv(rep, evidence);
  assert.ok(csv.startsWith('﻿分類,'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));

  const files = unzip(ja.submissionXlsx(rep, evidence));
  assert.deepEqual(Object.keys(files).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
  assert.match(files['xl/workbook.xml'], /<sheet name="点検結果"/);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.ok(sheet.includes(`<t xml:space="preserve">'=HYPERLINK(&quot;x&quot;)</t>`));
  assert.ok(!sheet.includes('<f>'), 'no formulas');
  assert.match(files['xl/worksheets/sheet2.xml'], /'=cmd\(\)|2: =cmd\(\)/);
  // The same report gives the same bytes.
  assert.deepEqual(ja.submissionXlsx(rep, evidence), ja.submissionXlsx(rep, evidence));
});

test('listSourceFiles skips excluded folders and symbolic links, and counts unsupported sources', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-list-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-outside-'));
  const write = (name) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), '');
  };
  ['src/a.ts', 'src/b.php', 'lib/c.min.js', 'node_modules/x/i.js', 'vendor/v.php', '.codes-doctor/r.json', 'app/Main.kt', 'x.rb', 'README.md'].forEach(write);
  fs.writeFileSync(path.join(outside, 'secret.ts'), '');
  fs.symlinkSync(outside, path.join(root, 'linked'));
  const listed = await ja.listSourceFiles(root);
  assert.deepEqual(listed.files.map((file) => path.relative(root, file).split(path.sep).join('/')), ['src/a.ts', 'src/b.php']);
  assert.equal(listed.unsupported, 2);
});
