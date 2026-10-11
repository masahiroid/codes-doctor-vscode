"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportLibraryScripts = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
/** Embed locally rebuilt, audited dependencies; do not use upstream prebundled CDN copies. */
function libraryScript(name) {
    const filename = node_path_1.default.join(__dirname, '..', '..', 'media', 'report-libraries', `${name}.js`);
    const code = node_fs_1.default.readFileSync(filename, 'utf8').replace(/<\/script/gi, '<\\/script');
    return `<script data-report-library="${name}">${code}</script>`;
}
exports.reportLibraryScripts = {
    get chart() { return libraryScript('chart'); },
    get mermaid() { return libraryScript('mermaid'); },
    get marked() { return libraryScript('marked'); },
    get d3() { return libraryScript('d3'); },
};
