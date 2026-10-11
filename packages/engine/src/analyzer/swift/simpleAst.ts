import type { SimpleFileInfo } from '../../types';
import { BraceLanguageConfig, analyzeBraceLanguageDirectory } from '../bracelang/engine';

const INIT_REGEX = /\binit\s*[?!]?\s*\(/;

export const SWIFT_CONFIG: BraceLanguageConfig = {
  languageName: 'Swift',
  typeHeaderRegex: /\b(?:class|struct|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  methodHeaderRegex: /\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g,
  importRegex: /^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)/gm,
  propertyRegex: /^\s*(?:@\w+\s*)*(?:public|private|internal|fileprivate|open|static|final|lazy|weak)?\s*(?:var|let)\s+[A-Za-z_][A-Za-z0-9_]*\s*:/gm,
  hasConstructor: (body) => INIT_REGEX.test(body),
};

export function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  return analyzeBraceLanguageDirectory(files, SWIFT_CONFIG);
}
