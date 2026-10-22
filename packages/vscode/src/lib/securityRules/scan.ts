import path from 'node:path';
import type { SecurityPack, SecurityRule } from './ruleset';

/** Compiling rules (patterns and engine data-flow detectors) and scanning file contents with them. */

const MAX_PATTERN_LENGTH = 500;
export const SCAN_LIMITS = Object.freeze({ maxFileBytes: 1024 * 1024, maxPerRulePerFile: 200, maxTotalCandidates: 5000 });
// A quantified group that itself contains a quantifier, e.g. (a+)+. Rules arrive over the network
// and run on the extension host thread, so patterns that can backtrack catastrophically are refused.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;

/** The engine functions this module needs; injected so the module stays testable without the bundle. */
export interface FlowEngine {
  compileTaintRule(id: string, detect: unknown): TaintRule;
  analyzeTaintRules(rules: TaintRule[], language: string, filePath: string, content: string): Promise<Array<FlowResult[] | null>>;
  taintRuleCovers(rule: TaintRule, language: string): boolean;
  isTestPath(filePath: string): boolean;
}
export type TaintRule = { id: string; languages: ReadonlySet<string> };
export interface FlowResult {
  category: string;
  source: { line: number; code: string };
  steps: Array<{ line: number; code: string }>;
  sink: { line: number; code: string };
  function?: string;
}

export interface CompiledRule {
  pack: SecurityPack;
  rule: SecurityRule;
  regex?: RegExp;
  taint?: TaintRule;
}

export interface Candidate {
  packId: string;
  ruleId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  /** Present when the candidate is a data flow from untrusted input, not a pattern match. */
  flow?: FlowResult;
}

export function compileRules(packs: SecurityPack[], engine?: FlowEngine): { compiled: CompiledRule[]; invalid: Array<{ packId: string; ruleId: string; reason: string }> } {
  const compiled: CompiledRule[] = [];
  const invalid: Array<{ packId: string; ruleId: string; reason: string }> = [];
  for (const pack of packs) {
    for (const rule of pack.rules) {
      // A rule with a deterministic detector uses it instead of its pattern.
      if (rule.detect !== undefined) {
        try {
          if (!engine) throw new Error('the analysis engine is not available');
          compiled.push({ pack, rule, taint: engine.compileTaintRule(rule.id, rule.detect) });
        } catch (error) {
          invalid.push({ packId: pack.id, ruleId: rule.id, reason: error instanceof Error ? error.message : String(error) });
        }
        continue;
      }
      if (rule.pattern === undefined) {
        compiled.push({ pack, rule });
        continue;
      }
      const reason = rule.pattern.length > MAX_PATTERN_LENGTH
        ? 'pattern is too long'
        : NESTED_QUANTIFIER.test(rule.pattern)
          ? 'pattern has nested quantifiers and could backtrack catastrophically'
          : undefined;
      if (reason) {
        invalid.push({ packId: pack.id, ruleId: rule.id, reason });
        continue;
      }
      try {
        compiled.push({ pack, rule, regex: new RegExp(rule.pattern, 'g') });
      } catch (error) {
        invalid.push({ packId: pack.id, ruleId: rule.id, reason: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { compiled, invalid };
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.json': 'json',
  '.php': 'php',
};

export function languageForFile(fileName: string): string | undefined {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.d.ts') || lower.endsWith('.min.js') || lower.endsWith('.bundle.js')) return undefined;
  return LANGUAGE_BY_EXTENSION[path.extname(lower)];
}

export const SCAN_GLOB = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs,json,php}';
/** Source files no security rule can analyze yet; counted so the panel can say they were not checked. */
export const UNSUPPORTED_SOURCE_GLOB = '**/*.{py,go,java,kt,kts,rb,cs,rs,swift,dart,c,cc,cpp,h,hpp,scala}';
export const SCAN_EXCLUDE_GLOB = '**/{node_modules,.git,dist,dist-en,out,build,coverage,vendor,.venv,.codes-doctor}/**';

export function scanText(text: string, language: string, rules: CompiledRule[], limits = SCAN_LIMITS): Candidate[] {
  const candidates: Candidate[] = [];
  let lineStarts: number[] | undefined;
  const position = (offset: number) => {
    if (!lineStarts) {
      lineStarts = [0];
      for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) lineStarts.push(index + 1);
    }
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return { line: low, column: offset - lineStarts[low] };
  };

  for (const { pack, rule, regex } of rules) {
    if (!regex || !rule.targetLanguages.includes(language)) continue;
    regex.lastIndex = 0;
    let count = 0;
    for (let match = regex.exec(text); match && count < limits.maxPerRulePerFile; match = regex.exec(text)) {
      if (match[0].length === 0) regex.lastIndex++;
      const start = position(match.index);
      const end = position(match.index + Math.max(match[0].length, 1));
      candidates.push({ packId: pack.id, ruleId: rule.id, startLine: start.line, startColumn: start.column, endLine: end.line, endColumn: end.column });
      count++;
    }
  }
  return candidates;
}

/** Pattern matches plus data flows for the rules that have a detector. */
export async function scanFile(text: string, language: string, filePath: string, rules: CompiledRule[], engine?: FlowEngine): Promise<Candidate[]> {
  const candidates = scanText(text, language, rules);
  if (!engine) return candidates;
  const flowRules = rules.filter((item): item is CompiledRule & { taint: TaintRule } => item.taint !== undefined);
  if (flowRules.length === 0) return candidates;
  let results: Array<FlowResult[] | null> = [];
  try {
    // One parse of the file serves every rule.
    results = await engine.analyzeTaintRules(flowRules.map((item) => item.taint), language, filePath, text);
  } catch {
    // A file the parser cannot read yields no flows; the pattern pass above still ran.
  }
  for (const [index, { pack, rule }] of flowRules.entries()) {
    for (const flow of results[index] ?? []) {
      const line = Math.max(flow.sink.line - 1, 0);
      const lineText = text.split('\n', line + 1)[line] ?? '';
      const indent = lineText.length - lineText.trimStart().length;
      candidates.push({ packId: pack.id, ruleId: rule.id, startLine: line, startColumn: indent, endLine: line, endColumn: Math.max(lineText.length, indent + 1), flow });
    }
  }
  return candidates;
}

module.exports = { SCAN_LIMITS, compileRules, languageForFile, SCAN_GLOB, UNSUPPORTED_SOURCE_GLOB, SCAN_EXCLUDE_GLOB, scanText, scanFile };
