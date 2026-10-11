import path from 'node:path';

export type Engine = typeof import('../../vendor/csap');
export type ReportLanguage = 'en' | 'ja';

/** Set by the esbuild bundle (scripts/bundle.mjs); undefined when running the tsc output. */
declare const CODE_DOCTOR_BUNDLED: boolean | undefined;
const bundled = typeof CODE_DOCTOR_BUNDLED !== 'undefined' && CODE_DOCTOR_BUNDLED;

/**
 * The engine build for a report language. Each language is a separate engine build:
 * bundled next to the extension in the VSIX (dist/engine-ja.js, dist/engine-en.js),
 * or copied by the vendor step (vendor/csap, vendor/csap-en) during development and tests.
 */
export function loadEngine(language: ReportLanguage): Engine {
  const location = bundled
    ? path.join(__dirname, language === 'ja' ? 'engine-ja.js' : 'engine-en.js')
    : path.join(__dirname, '..', 'vendor', language === 'ja' ? 'csap' : 'csap-en');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(location);
}
