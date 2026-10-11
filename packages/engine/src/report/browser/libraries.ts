import fs from 'node:fs';
import path from 'node:path';

export type ReportLibrary = 'chart' | 'mermaid' | 'marked' | 'd3';

const LIBRARY_SUBDIR = path.join('assets', 'report-libraries');

/**
 * Libraries are built by scripts/build-report-libraries.mjs into `assets/`, which sits
 * next to the engine build in every layout (engine package, extension vendor folder,
 * CLI package). Search upward from this module for it.
 */
function findLibraryDir(): string {
  for (let dir = __dirname; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, LIBRARY_SUBDIR);
    if (fs.existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`Report libraries not found above ${__dirname}`);
  }
}

let libraryDir: string | undefined;

/** An inline `<script>` element for a bundled library, safe to embed in report HTML. */
export function reportLibraryScript(name: ReportLibrary): string {
  const code = fs.readFileSync(path.join(libraryDir ??= findLibraryDir(), `${name}.js`), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script data-report-library="${name}">${code}</script>`;
}
