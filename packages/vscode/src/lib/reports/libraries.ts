import { reportLibraryScript, ReportLibrary } from '../reportScripts';

/** Only replace known library tags; leave report content and unrelated script URLs untouched. */
export function upgradeReportLibraries(html: string): string {
  html = html.replace(/<script\b[^>]*\bdata-report-library=(["'])(chart|mermaid|marked|d3)\1[^>]*>[\s\S]*?<\/script\s*>/gi,
    (_tag, _quote, name: ReportLibrary) => reportLibraryScript(name));
  return html.replace(/<script\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*<\/script\s*>/gi, (tag, _quote, src: string) => {
    let url: URL;
    try { url = new URL(src); } catch { return tag; }
    if (url.hostname === 'd3js.org' && /^\/d3\.v\d+\.min\.js$/.test(url.pathname)) return reportLibraryScript('d3');
    if (url.hostname !== 'cdn.jsdelivr.net') return tag;
    const name = /^\/npm\/(chart\.js|mermaid|marked)(?:@|\/)/.exec(url.pathname)?.[1];
    if (name === 'chart.js') return reportLibraryScript('chart');
    if (name === 'mermaid') return reportLibraryScript('mermaid');
    if (name === 'marked') return reportLibraryScript('marked');
    return tag;
  });
}
