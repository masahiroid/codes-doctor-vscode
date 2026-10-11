const test = require('node:test');
const assert = require('node:assert/strict');

test('translations are escaped for the literal they are inserted into', async () => {
  const { localize } = await import('../scripts/localize-en.mjs');
  const translations = require('../locales/report-en.json');
  const phrase = Object.keys(translations).find((key) => translations[key].includes("'"));
  assert.ok(phrase, 'fixture needs a translation containing an apostrophe');
  const source = `const a = '${phrase}'; const b = "${phrase}"; const c = \`${phrase}\${x}\`;`;
  const output = localize(source, 'fixture.js');
  // The localized module must still parse, and each string must keep the translation.
  const values = new Function('x', `${output}; return [a, b, c];`)('!');
  for (const value of values) assert.ok(value.includes(translations[phrase].trim().slice(0, 20)));
});
