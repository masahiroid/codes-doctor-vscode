"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const esbuild_1 = require("esbuild");
const root = node_path_1.default.resolve(__dirname, '..');
const output = node_path_1.default.join(root, 'media', 'report-libraries');
const libraries = [
    { name: 'chart', entry: "import Chart from 'chart.js/auto'; globalThis.Chart = Chart;" },
    { name: 'mermaid', entry: "import mermaid from 'mermaid'; globalThis.mermaid = mermaid;" },
    { name: 'marked', entry: "import * as marked from 'marked'; import DOMPurify from 'dompurify'; globalThis.marked = { ...marked, parse: (...args) => { const html = marked.parse(...args); return typeof html === 'string' ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : html.then(value => DOMPurify.sanitize(value, { USE_PROFILES: { html: true } })); } };" },
    { name: 'd3', entry: "import * as d3 from 'd3'; globalThis.d3 = d3;" },
];
async function main() {
    node_fs_1.default.mkdirSync(output, { recursive: true });
    for (const library of libraries) {
        await (0, esbuild_1.build)({
            stdin: { contents: library.entry, resolveDir: root, sourcefile: `${library.name}-entry.js` },
            outfile: node_path_1.default.join(output, `${library.name}.js`),
            bundle: true,
            format: 'iife',
            platform: 'browser',
            target: 'es2020',
            minify: true,
            metafile: true,
            legalComments: 'eof',
        }).then(result => {
            node_fs_1.default.writeFileSync(node_path_1.default.join(output, `${library.name}.meta.json`), JSON.stringify(result.metafile, null, 2));
        });
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
