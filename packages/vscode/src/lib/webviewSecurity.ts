import { createHash } from 'node:crypto';

/** Hash the report's inline scripts; inline event handlers and remote code stay blocked. */
export function secureWebviewHtml(html: string, cspSource: string): string {
  const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .map(([, script]) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
  const policy = `default-src 'none'; script-src ${hashes.join(' ') || "'none'"}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:; font-src ${cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none'`;
  return html.replace(/<head\b[^>]*>/i, head => `${head}\n<meta http-equiv="Content-Security-Policy" content="${policy}">`);
}
