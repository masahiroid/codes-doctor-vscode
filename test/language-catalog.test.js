const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../package.json');
const nls = require('../package.nls.json');

const languageSetting = manifest.contributes.configuration.properties['codeDoctor.analysisLanguage'];

for (const folder of ['csap', 'csap-en']) {
  test(`${folder}: analysisLanguage setting offers exactly the engine's languages`, () => {
    const { ANALYSIS_LANGUAGES } = require(`../vendor/${folder}/analyzer/languages/catalog`);
    assert.deepEqual(languageSetting.enum, [...ANALYSIS_LANGUAGES]);
  });
}

test('every analysisLanguage value has a setting description and a dashboard label', () => {
  assert.equal(languageSetting.enumDescriptions.length, languageSetting.enum.length);
  for (const description of languageSetting.enumDescriptions) {
    assert.ok(nls[description.slice(1, -1)], `Missing ${description} in package.nls.json`);
  }
  const { enumOptions } = require('../lib/dashboard/settings');
  assert.deepEqual(enumOptions('analysisLanguage').map((option) => option.value), languageSetting.enum);
});

test('engine rejects unknown analysis languages at the boundary', () => {
  const { toAnalysisLanguage } = require('../vendor/csap/analyzer/languages/catalog');
  assert.equal(toAnalysisLanguage(undefined), 'auto');
  assert.equal(toAnalysisLanguage('rust'), 'rust');
  assert.throws(() => toAnalysisLanguage('cobol'), /Unsupported analysis language/);
});
