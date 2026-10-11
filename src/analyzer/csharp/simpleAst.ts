import type { SimpleFileInfo } from '../../types';
import { BraceLanguageConfig, analyzeBraceLanguageDirectory } from '../bracelang/engine';

const MODIFIERS = 'public|private|protected|internal|static|readonly|sealed|abstract|partial|virtual|override|async|unsafe|new|extern';
const CONSTRUCTOR_REGEX = /\bpublic\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/;

export const CSHARP_CONFIG: BraceLanguageConfig = {
  languageName: 'C#',
  typeHeaderRegex: new RegExp(`\\b(?:(?:${MODIFIERS})\\s+)*(?:class|struct|interface|record)\\s+([A-Za-z_][A-Za-z0-9_]*)`, 'g'),
  // Requires a parameter list before `{`, which excludes auto-property `{ get; set; }` syntax.
  methodHeaderRegex: new RegExp(
    `\\b(?:(?:${MODIFIERS})\\s+)*[A-Za-z_][A-Za-z0-9_<>\\[\\],.?]*\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?:<[^>]*>)?\\s*\\(([^)]*)\\)\\s*(?:where\\s+[^{]+)?\\{`,
    'g'
  ),
  importRegex: /^\s*using\s+(?:static\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm,
  propertyRegex: /^\s*(?:(?:public|private|protected|internal|static|readonly|virtual|override|abstract)\s+)*[A-Za-z_][A-Za-z0-9_<>[\],.?]*\s+[A-Za-z_][A-Za-z0-9_]*\s*\{\s*(?:get|set)/gm,
  hasConstructor: (body) => CONSTRUCTOR_REGEX.test(body),
};

export function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  return analyzeBraceLanguageDirectory(files, CSHARP_CONFIG);
}
