import type { LanguageId } from '../catalog';
import { analyzeDirectory as parseDart } from '../../dart/simpleAst';
import { analyzeDirectory as parseSwift } from '../../swift/simpleAst';
import { analyzeDirectory as parseKotlin } from '../../kotlin/simpleAst';
import { SYNTAX_SPECS, syntaxDirectoryParser } from '../../syntax';
import { analyzeTypeScript } from './typescriptAnalyzer';
import { analyzePhp } from './phpAnalyzer';
import { createSimpleAnalyzer } from './simpleAnalyzer';
import type { LanguageAnalyzer } from './types';

export type { LanguageAnalysisContext, LanguageAnalysisOutput, LanguageAnalyzer } from './types';

/** One analyzer per catalog language; the mapped type forces every language to have one. */
export const LANGUAGE_ANALYZERS: { [K in LanguageId]: LanguageAnalyzer<K> } = {
  typescript: analyzeTypeScript,
  php: analyzePhp,
  dart: createSimpleAnalyzer('dart', parseDart),
  python: createSimpleAnalyzer('python', syntaxDirectoryParser(SYNTAX_SPECS.python)),
  go: createSimpleAnalyzer('go', syntaxDirectoryParser(SYNTAX_SPECS.go)),
  swift: createSimpleAnalyzer('swift', parseSwift),
  csharp: createSimpleAnalyzer('csharp', syntaxDirectoryParser(SYNTAX_SPECS.csharp)),
  java: createSimpleAnalyzer('java', syntaxDirectoryParser(SYNTAX_SPECS.java)),
  kotlin: createSimpleAnalyzer('kotlin', parseKotlin),
  rust: createSimpleAnalyzer('rust', syntaxDirectoryParser(SYNTAX_SPECS.rust)),
  cpp: createSimpleAnalyzer('cpp', syntaxDirectoryParser(SYNTAX_SPECS.cpp)),
};
