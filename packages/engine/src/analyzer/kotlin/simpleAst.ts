import type { SimpleFileInfo } from '../../types';
import { BraceLanguageConfig, analyzeBraceLanguageDirectory } from '../bracelang/engine';

const MODIFIERS =
  'public|private|protected|internal|open|final|abstract|sealed|data|inner|enum|annotation|companion|override|suspend|inline|infix|operator|tailrec|external';

export const KOTLIN_CONFIG: BraceLanguageConfig = {
  languageName: 'Kotlin',
  typeHeaderRegex: new RegExp(
    `\\b(?:(?:${MODIFIERS})\\s+)*(?:class|interface|object)\\s+([A-Za-z_][A-Za-z0-9_]*)`,
    'g'
  ),
  // `fun name(params): ReturnType {` — Kotlin puts the return type after the
  // parameter list, so unlike Java/C# we don't need to consume one before the name.
  methodHeaderRegex: new RegExp(
    `\\bfun\\s+(?:<[^>]*>\\s+)?([A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^)]*)\\)\\s*(?::\\s*[A-Za-z_][A-Za-z0-9_<>.,?\\s]*)?\\s*\\{`,
    'g'
  ),
  importRegex: /^\s*import\s+([A-Za-z_][A-Za-z0-9_.]*)/gm,
  propertyRegex: /^\s*(?:(?:public|private|protected|internal|open|final|override|lateinit|const)\s+)*(?:val|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*[:=]/gm,
  // Kotlin's constructor is most often a primary constructor declared right in
  // the class header, e.g. `class Foo(val x: Int) : Bar()` — detected from
  // headerText. A secondary constructor uses the `constructor(...)` keyword
  // inside the body instead.
  hasConstructor: (body: string, _typeName: string, headerText: string): boolean => {
    return /\bconstructor\s*\(/.test(body) || /\)\s*(?::|$)/.test(headerText.trimEnd());
  },
};

export function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  return analyzeBraceLanguageDirectory(files, KOTLIN_CONFIG);
}
