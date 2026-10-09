import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'media', 'report-libraries');
const libraries = [
  { name: 'chart', entry: "import Chart from 'chart.js/auto'; globalThis.Chart = Chart;" },
  { name: 'mermaid', entry: "import mermaid from 'mermaid'; globalThis.mermaid = mermaid;" },
  { name: 'marked', entry: "import * as marked from 'marked'; import DOMPurify from 'dompurify'; globalThis.marked = { ...marked, parse: (...args) => { const html = marked.parse(...args); return typeof html === 'string' ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : html.then(value => DOMPurify.sanitize(value, { USE_PROFILES: { html: true } })); } };" },
  { name: 'd3', entry: "import * as d3 from 'd3'; globalThis.d3 = d3;" },
];

async function main(): Promise<void> {
  fs.mkdirSync(output, { recursive: true });
  for (const library of libraries) {
    await build({
      stdin: { contents: library.entry, resolveDir: root, sourcefile: `${library.name}-entry.js` },
      outfile: path.join(output, `${library.name}.js`),
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: true,
      metafile: true,
      legalComments: 'eof',
    }).then(result => {
      fs.writeFileSync(path.join(output, `${library.name}.meta.json`), JSON.stringify(result.metafile, null, 2));
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
