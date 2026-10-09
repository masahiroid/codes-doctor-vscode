"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.secureWebviewHtml = secureWebviewHtml;
const node_crypto_1 = require("node:crypto");
/** Hash the report's inline scripts; inline event handlers and remote code stay blocked. */
function secureWebviewHtml(html, cspSource) {
    const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
        .map(([, script]) => `'sha256-${(0, node_crypto_1.createHash)('sha256').update(script).digest('base64')}'`);
    const policy = `default-src 'none'; script-src ${hashes.join(' ') || "'none'"}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none'`;
    return html.replace(/<head\b[^>]*>/i, head => `${head}\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
