import fs from 'node:fs';
import path from 'node:path';

export type ReportLibrary = 'chart' | 'mermaid' | 'marked' | 'd3';

/** Built by scripts/build-report-libraries.mjs; resolved from dist/report/browser/. */
const LIBRARY_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'report-libraries');

/** An inline `<script>` element for a bundled library, safe to embed in report HTML. */
export function reportLibraryScript(name: ReportLibrary): string {
  const code = fs.readFileSync(path.join(LIBRARY_DIR, `${name}.js`), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script data-report-library="${name}">${code}</script>`;
}
