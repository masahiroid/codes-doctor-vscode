import type { LanguageId } from '../catalog';
import { analyzeDirectory as parseDart } from '../../dart/simpleAst';
import { analyzeDirectory as parsePython } from '../../python/simpleAst';
import { analyzeDirectory as parseGo } from '../../go/simpleAst';
import { analyzeDirectory as parseSwift } from '../../swift/simpleAst';
import { analyzeDirectory as parseCSharp } from '../../csharp/simpleAst';
import { analyzeDirectory as parseJava } from '../../java/simpleAst';
import { analyzeDirectory as parseKotlin } from '../../kotlin/simpleAst';
import { analyzeDirectory as parseRust } from '../../rust/simpleAst';
import { analyzeDirectory as parseCpp } from '../../cpp/simpleAst';
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
  python: createSimpleAnalyzer('python', parsePython),
  go: createSimpleAnalyzer('go', parseGo),
  swift: createSimpleAnalyzer('swift', parseSwift),
  csharp: createSimpleAnalyzer('csharp', parseCSharp),
  java: createSimpleAnalyzer('java', parseJava),
  kotlin: createSimpleAnalyzer('kotlin', parseKotlin),
  rust: createSimpleAnalyzer('rust', parseRust),
  cpp: createSimpleAnalyzer('cpp', parseCpp),
};
