"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upgradeReportLibraries = upgradeReportLibraries;
const browserLibraries_1 = require("../engine/browserLibraries");
/** Only replace known library tags; leave report content and unrelated script URLs untouched. */
function upgradeReportLibraries(html) {
    html = html.replace(/<script\b[^>]*\bdata-report-library=(["'])(chart|mermaid|marked|d3)\1[^>]*>[\s\S]*?<\/script\s*>/gi, (_tag, _quote, name) => browserLibraries_1.reportLibraryScripts[name]);
    return html.replace(/<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*<\/script\s*>/gi, (tag, _quote, src) => {
        let url;
        try {
            url = new URL(src);
        }
        catch {
            return tag;
        }
        if (url.hostname === 'd3js.org' && /^\/d3\.v\d+\.min\.js$/.test(url.pathname))
            return browserLibraries_1.reportLibraryScripts.d3;
        if (url.hostname !== 'cdn.jsdelivr.net')
            return tag;
        const name = /^\/npm\/(chart\.js|mermaid|marked)(?:@|\/)/.exec(url.pathname)?.[1];
        if (name === 'chart.js')
            return browserLibraries_1.reportLibraryScripts.chart;
        if (name === 'mermaid')
            return browserLibraries_1.reportLibraryScripts.mermaid;
        if (name === 'marked')
            return browserLibraries_1.reportLibraryScripts.marked;
        return tag;
    });
}
