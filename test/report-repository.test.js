const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const repository = require('../lib/reports/repository');
const facade = require('../lib/analyzer');

test('report repository preserves history ordering, metadata and corrupt-file isolation through facade', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-repository-'));
  try {
    fs.writeFileSync(path.join(root, 'old.html'), '<html lang="ja">');
    fs.writeFileSync(path.join(root, 'new.html'), '<html lang="en">');
    fs.utimesSync(path.join(root, 'old.html'), new Date('2025-01-01'), new Date('2025-01-01'));
    fs.writeFileSync(path.join(root, 'new.llm-context.json'), JSON.stringify({ repoName: 'sample', analyzedAt: '2026-10-10' }));
    fs.writeFileSync(path.join(root, 'old.llm-context.json'), 'broken');
    fs.writeFileSync(path.join(root, 'new.llm-older.json'), JSON.stringify({ createdAt: '2025-01-01', provider: 'openai' }));
    fs.writeFileSync(path.join(root, 'new.llm-newer.json'), JSON.stringify({ createdAt: '2026-01-01', model: 'model' }));
    fs.writeFileSync(path.join(root, 'new.llm-broken.json'), 'broken');
    fs.writeFileSync(path.join(root, 'other.llm-result.json'), '{}');
    const reports = facade.listReports(root);
    assert.deepEqual(reports.map(r => r.analysisId), ['new', 'old']);
    assert.equal(reports[0].repoName, 'sample');
    assert.equal(reports[1].repoName, undefined);
    assert.deepEqual(facade.listLlmResults('new', root).map(r => r.focus), ['newer', 'older', 'context']); // Preserve the existing filename-based listing contract.
    assert.equal(facade.getReportLanguage(reports[1].reportPath), 'ja');
    assert.equal(facade.getReportLanguage(path.join(root, 'missing.html')), 'en');
    assert.deepEqual(repository.listReports(path.join(root, 'missing')), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('history metadata accepts only string fields and isolates invalid JSON shapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codes-history-types-'));
  try {
    fs.writeFileSync(path.join(root, 'example.html'), '<html lang="en">');
    fs.writeFileSync(path.join(root, 'example.llm-context.json'), JSON.stringify({ repoName: { bad: true }, analyzedAt: 1 }));
    fs.writeFileSync(path.join(root, 'example.llm-review.json'), JSON.stringify({ provider: {}, model: 42, createdAt: [], mode: 'full' }));
    fs.writeFileSync(path.join(root, 'example.llm-null.json'), 'null');
    fs.writeFileSync(path.join(root, 'example.llm-array.json'), '[]');
    const [report] = repository.listReports(root);
    assert.equal(report.repoName, undefined);
    assert.equal(report.analyzedAt, undefined);
    const review = repository.listLlmResults('example', root).find(item => item.focus === 'review');
    assert.deepEqual(review, { focus: 'review', provider: undefined, model: undefined, createdAt: undefined, mode: 'full' });
    assert.ok(repository.listLlmResults('example', root).every(item => !['null', 'array'].includes(item.focus)));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
