import type { SimpleFileInfo } from '../../types';
import { BraceLanguageConfig, analyzeBraceLanguageDirectory } from '../bracelang/engine';

const MODIFIERS =
  'public|private|protected|static|final|abstract|synchronized|native|transient|volatile|strictfp|default';

export const JAVA_CONFIG: BraceLanguageConfig = {
  languageName: 'Java',
  typeHeaderRegex: new RegExp(
    `\\b(?:(?:${MODIFIERS})\\s+)*(?:class|interface|enum|record)\\s+([A-Za-z_][A-Za-z0-9_]*)`,
    'g'
  ),
  // A method header: optional modifiers/annotations, a return type (or none for
  // constructors), a name, then a parenthesized parameter list followed by `{`.
  methodHeaderRegex: new RegExp(
    `\\b(?:(?:${MODIFIERS})\\s+)*(?:[A-Za-z_][A-Za-z0-9_<>\\[\\],.?]*\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*(?:<[^>]*>)?\\s*\\(([^)]*)\\)\\s*(?:throws\\s+[^{]+)?\\{`,
    'g'
  ),
  importRegex: /^\s*import\s+(?:static\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm,
  propertyRegex:
    /^\s*(?:(?:public|private|protected|static|final|volatile|transient)\s+)*[A-Za-z_][A-Za-z0-9_<>[\],.?]*\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:=[^;]*)?;/gm,
  hasConstructor: (body: string, typeName: string): boolean => {
    const ctorRegex = new RegExp(`\\b(?:(?:${MODIFIERS})\\s+)*${typeName}\\s*\\(`);
    return ctorRegex.test(body);
  },
};

export function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  return analyzeBraceLanguageDirectory(files, JAVA_CONFIG);
}
