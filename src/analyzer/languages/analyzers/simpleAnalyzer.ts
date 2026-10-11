import type { SimpleFileInfo } from '../../../types';
import { LANGUAGES } from '../catalog';
import { LanguageAnalyzer, scoreGodClasses } from './types';

type SimpleLanguageId = Extract<(typeof LANGUAGES)[number], { parser: 'lightweight' }>['id'];

/** Analyzer for a lightweight (regex-based) language: parse its files, then score its classes. */
export function createSimpleAnalyzer<K extends SimpleLanguageId>(
  id: K,
  parseDirectory: (files: string[]) => Promise<SimpleFileInfo[]>
): LanguageAnalyzer<K> {
  const definition = LANGUAGES.find((language) => language.id === id)!;
  return async ({ sourceFiles }) => {
    const paths = definition.sources.flatMap((source) => sourceFiles[source]);
    if (paths.length === 0) return { files: [], godClasses: [] };

    console.log(`\n[${definition.label}] Parsing ${paths.length} files...`);
    try {
      const files = await parseDirectory(paths);
      const godClasses = scoreGodClasses(files, (c) => c);
      console.log(`   [OK] ${files.length} files, ${files.reduce((sum, f) => sum + f.classes.length, 0)} classes`);
      return { files, godClasses };
    } catch (error) {
      console.error(`   [ERROR] ${definition.label} analysis failed:`, error);
      return { files: [], godClasses: [] };
    }
  };
}
