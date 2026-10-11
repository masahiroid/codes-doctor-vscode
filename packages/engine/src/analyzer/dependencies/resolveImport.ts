import path from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DIRECTORY_ENTRYPOINT = 'index';

/**
 * Resolve a relative import specifier to one of the analyzed files, trying the
 * specifier as written, with each source extension, and as a directory index.
 * Package imports (bare specifiers) are external and resolve to undefined.
 */
export function resolveInternalImport(filePath: string, specifier: string, files: ReadonlyArray<{ filePath: string }>): string | undefined {
  if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) return undefined;
  const base = path.resolve(path.dirname(filePath), specifier);
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => base + ext),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(base, DIRECTORY_ENTRYPOINT + ext)),
  ];
  return files.find((file) => candidates.includes(path.resolve(file.filePath)))?.filePath;
}
