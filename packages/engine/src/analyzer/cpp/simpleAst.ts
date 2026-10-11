import type { SimpleFileInfo } from '../../types';
import { BraceLanguageConfig, analyzeBraceLanguageDirectory } from '../bracelang/engine';

const MODIFIERS = 'public|private|protected|static|virtual|inline|explicit|constexpr|friend|override|final|mutable';

export const CPP_CONFIG: BraceLanguageConfig = {
  languageName: 'C++',
  // `class Foo : public Bar, private Baz {` or `struct Foo {` — the inheritance
  // list (if any) is skipped by requiring the name right after the keyword.
  typeHeaderRegex: new RegExp(`\\b(?:class|struct)\\s+([A-Za-z_][A-Za-z0-9_]*)`, 'g'),
  // A method header: optional modifiers, a return type (or none for
  // constructors/destructors), a name (allowing `~Foo` for destructors),
  // a parameter list, an optional const/noexcept/override qualifier, an
  // optional constructor initializer list (`: a(1), b(2)`), then `{`.
  methodHeaderRegex: new RegExp(
    `\\b(?:(?:${MODIFIERS})\\s+)*(?:[A-Za-z_][A-Za-z0-9_:<>\\[\\],*&.]*\\s+)?(~?[A-Za-z_][A-Za-z0-9_]*)\\s*\\(([^)]*)\\)\\s*(?:const\\s*)?(?:noexcept\\s*)?(?:override\\s*)?(?:final\\s*)?(?:try\\s*)?(?::\\s*[^{]+)?\\{`,
    'g'
  ),
  importRegex: /^\s*#include\s*[<"]([^>"]+)[>"]/gm,
  propertyRegex:
    /^\s*(?:(?:public|private|protected|static|const|mutable|constexpr)\s*:?\s*)*[A-Za-z_][A-Za-z0-9_:<>[\],*&.]*\s+[A-Za-z_][A-Za-z0-9_]*\s*(?:=[^;(]*)?;/gm,
  hasConstructor: (body: string, typeName: string): boolean => {
    const ctorRegex = new RegExp(`\\b(?:(?:${MODIFIERS})\\s+)*${typeName}\\s*\\(`);
    return ctorRegex.test(body);
  },
};

export function analyzeDirectory(files: string[]): Promise<SimpleFileInfo[]> {
  return analyzeBraceLanguageDirectory(files, CPP_CONFIG);
}
