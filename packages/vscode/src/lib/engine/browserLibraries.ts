import fs from 'node:fs';
import path from 'node:path';

/** Embed locally rebuilt, audited dependencies; do not use upstream prebundled CDN copies. */
function libraryScript(name: string): string {
  const filename = path.join(__dirname, '..', '..', 'media', 'report-libraries', `${name}.js`);
  const code = fs.readFileSync(filename, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script data-report-library="${name}">${code}</script>`;
}
export const reportLibraryScripts = {
  get chart(): string { return libraryScript('chart'); },
  get mermaid(): string { return libraryScript('mermaid'); },
  get marked(): string { return libraryScript('marked'); },
  get d3(): string { return libraryScript('d3'); },
};
