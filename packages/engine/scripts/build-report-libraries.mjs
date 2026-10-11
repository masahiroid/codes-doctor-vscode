// Bundles the browser libraries embedded in every report (charts, diagrams, Markdown).
// Reports inline these builds instead of loading prebuilt CDN copies, so they open
// offline and only ship the audited versions pinned in package.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'assets', 'report-libraries');
const libraries = [
  { name: 'chart', entry: "import Chart from 'chart.js/auto'; globalThis.Chart = Chart;" },
  { name: 'mermaid', entry: "import mermaid from 'mermaid'; globalThis.mermaid = mermaid;" },
  // Every Markdown render is sanitized, including saved LLM output.
  { name: 'marked', entry: "import * as marked from 'marked'; import DOMPurify from 'dompurify'; globalThis.marked = { ...marked, parse: (...args) => { const html = marked.parse(...args); return typeof html === 'string' ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : html.then(value => DOMPurify.sanitize(value, { USE_PROFILES: { html: true } })); } };" },
  { name: 'd3', entry: "import * as d3 from 'd3'; globalThis.d3 = d3;" },
];

fs.mkdirSync(output, { recursive: true });
for (const library of libraries) {
  const result = await build({
    stdin: { contents: library.entry, resolveDir: root, sourcefile: `${library.name}-entry.js` },
    outfile: path.join(output, `${library.name}.js`),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    metafile: true,
    legalComments: 'eof',
  });
  fs.writeFileSync(path.join(output, `${library.name}.meta.json`), JSON.stringify(result.metafile, null, 2));
}
