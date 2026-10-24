import type { FlowGrammar, FlowSpec, SinkCategory, SinkRule } from './spec';
import { FLOW_SPECS } from './languages';
import { analyzeFlowsWithSpecs, flowGrammarFor } from './taint';
import type { DataFlow } from './taint';
import { analyzeAccessWithIndex, analyzeFileWithIndex, buildFlowIndex } from './project';
import { accessSpec, analyzeAccess } from './access';
import type { AccessEndpoint, AccessOptions } from './access';
import type { FlowIndex, SpecsFor } from './project';

/**
 * A taint rule as distributed in a rule pack (`detect: { type: taint, ... }`). Sources and
 * sanitizers extend the language's built-in ones; sinks are either built-in categories or
 * callee patterns. Patterns are regular expressions; callee patterns match the whole callee text.
 */
export interface TaintRuleDefinition {
  type: 'taint';
  languages: string[];
  sources?: string[];
  sanitizers?: string[];
  sinks: Array<{ builtin: SinkCategory } | { callee: string; argument?: number }>;
  /** Whether the language's built-in sources count as well; true when absent. */
  builtin_sources?: boolean;
}

export interface CompiledTaintRule {
  id: string;
  /** `taint`: input reaching dangerous calls. `access`: request IDs reaching lookups without an ownership check (BOLA). */
  kind: 'taint' | 'access';
  languages: ReadonlySet<string>;
  specs: Map<FlowGrammar, FlowSpec<string>>;
  /** For `access` rules: project-specific expressions for the signed-in user and authorization calls. */
  access?: AccessOptions;
}

const BUILTIN_SINKS: ReadonlySet<string> = new Set<SinkCategory>(['Command Injection', 'SQL Injection', 'Code Injection', 'Path Traversal', 'SSRF', 'XSS']);
const MAX_PATTERN_LENGTH = 300;
// A quantified group that itself contains a quantifier, e.g. (a+)+. Rules arrive over the network
// and run on the analysis thread, so patterns that can backtrack catastrophically are refused.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)\s*(?:[+*]|\{\d+,\d*\})/;

function pattern(source: unknown, where: string): string {
  if (typeof source !== 'string' || source.length === 0) throw new Error(`${where}: pattern must be a non-empty string`);
  if (source.length > MAX_PATTERN_LENGTH) throw new Error(`${where}: pattern is too long`);
  if (NESTED_QUANTIFIER.test(source)) throw new Error(`${where}: pattern has nested quantifiers`);
  new RegExp(source);
  return source;
}

function patterns(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${where} must be an array`);
  return value.map((item, index) => pattern(item, `${where}[${index}]`));
}

const union = (parts: string[]) => new RegExp(parts.map((part) => `(?:${part})`).join('|'));

/** Grammars a rule language runs on; TypeScript covers TS, TSX and plain JavaScript files. */
function grammarsFor(language: string): FlowGrammar[] {
  if (language === 'typescript') return ['typescript', 'tsx', 'javascript'];
  return language in FLOW_SPECS ? [language as FlowGrammar] : [];
}

/** Validate a distributed rule and build one flow spec per grammar. Throws on anything unusable. */
export function compileTaintRule(id: string, input: unknown): CompiledTaintRule {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${id}: detect must be an object`);
  const definition = input as Record<string, unknown>;
  if (definition.type !== 'taint' && definition.type !== 'object_access') throw new Error(`${id}: unsupported detect type ${String(definition.type)}`);
  if (!Array.isArray(definition.languages) || definition.languages.length === 0) throw new Error(`${id}: detect.languages is required`);
  const languages = definition.languages.map(String);
  if (definition.type === 'object_access') return compileAccessRule(id, definition, languages);
  const sources = patterns(definition.sources, `${id}.sources`);
  const sanitizers = patterns(definition.sanitizers, `${id}.sanitizers`);
  if (!Array.isArray(definition.sinks) || definition.sinks.length === 0) throw new Error(`${id}: detect.sinks is required`);
  const sinks = definition.sinks.map((raw, index) => {
    const sink = (raw ?? {}) as Record<string, unknown>;
    if (typeof sink.builtin === 'string') {
      if (!BUILTIN_SINKS.has(sink.builtin)) throw new Error(`${id}.sinks[${index}]: unknown builtin ${sink.builtin}`);
      return { builtin: sink.builtin as SinkCategory };
    }
    const argument = sink.argument === undefined ? undefined : Number(sink.argument);
    if (argument !== undefined && !(Number.isInteger(argument) && argument >= 0)) throw new Error(`${id}.sinks[${index}]: argument must be a non-negative integer`);
    return { callee: pattern(sink.callee, `${id}.sinks[${index}].callee`), argument };
  });
  const builtinSources = definition.builtin_sources !== false;
  if (!builtinSources && sources.length === 0) throw new Error(`${id}: no sources`);

  const specs = new Map<FlowGrammar, FlowSpec<string>>();
  for (const language of languages) {
    for (const grammar of grammarsFor(language)) {
      const base = FLOW_SPECS[grammar];
      const builtins = new Set(sinks.flatMap((sink) => ('builtin' in sink ? [sink.builtin] : [])));
      const ruleSinks: SinkRule<string>[] = [
        ...base.sinks.filter((sink) => builtins.has(sink.category)),
        ...sinks.flatMap((sink) => ('callee' in sink ? [{ category: id, callee: new RegExp(`^(?:${sink.callee})$`), argument: sink.argument }] : [])),
      ];
      specs.set(grammar, {
        ...base,
        sources: union([...(builtinSources ? [base.sources.source] : []), ...sources]),
        sanitizers: sanitizers.length > 0 ? union([base.sanitizers.source, ...sanitizers.map((s) => `^(?:${s})$`)]) : base.sanitizers,
        sinks: ruleSinks,
        sinkAssignments: (base.sinkAssignments ?? []).filter((sink) => builtins.has(sink.category)),
        sinkStatements: (base.sinkStatements ?? []).filter((sink) => builtins.has(sink.category)),
      });
    }
  }
  if (specs.size === 0) throw new Error(`${id}: none of the languages ${languages.join(', ')} support flow analysis`);
  return { id, kind: 'taint', languages: new Set(languages), specs };
}

/**
 * `detect: { type: object_access, languages, owner_references?, authorization_calls? }`: the
 * built-in BOLA analysis, optionally told how this project names the signed-in user and its
 * authorization checks.
 */
function compileAccessRule(id: string, definition: Record<string, unknown>, languages: string[]): CompiledTaintRule {
  const ownerReferences = patterns(definition.owner_references, `${id}.owner_references`).map((source) => new RegExp(source));
  const authorizationCalls = patterns(definition.authorization_calls, `${id}.authorization_calls`).map((source) => new RegExp(`^(?:${source})$`));
  const specs = new Map<FlowGrammar, FlowSpec<string>>();
  for (const language of languages) {
    for (const grammar of grammarsFor(language)) {
      const spec = accessSpec(grammar);
      if (spec) specs.set(grammar, spec);
    }
  }
  if (specs.size === 0) throw new Error(`${id}: none of the languages ${languages.join(', ')} support object access analysis`);
  return { id, kind: 'access', languages: new Set(languages), specs, access: { ownerReferences, authorizationCalls } };
}

/**
 * Flows for one rule in one file, or null when the rule does not cover the file's language.
 * `language` is the analysis language (typescript, javascript, php, ...).
 */
export async function analyzeTaintRule(rule: CompiledTaintRule, language: string, filePath: string, content: string): Promise<DataFlow<string>[] | null> {
  return (await analyzeTaintRules([rule], language, filePath, content))[0];
}

/** Whether a rule covers files of an analysis language; TypeScript rules also cover JavaScript. */
export function taintRuleCovers(rule: CompiledTaintRule, language: string): boolean {
  return rule.languages.has(language) || (language === 'javascript' && rule.languages.has('typescript'));
}

/**
 * Several rules over one parse of the file. Each result is the rule's flows, or null when
 * the rule does not cover the file's language.
 */
export async function analyzeTaintRules(rules: readonly CompiledTaintRule[], language: string, filePath: string, content: string): Promise<Array<DataFlow<string>[] | null>> {
  const grammar = flowGrammarFor(language, filePath);
  // Access rules report endpoints (analyzeAccessRules), not plain flows.
  const specs = rules.map((rule) => (grammar && rule.kind === 'taint' && taintRuleCovers(rule, language) ? rule.specs.get(grammar) : undefined));
  const applicable = specs.filter((spec): spec is FlowSpec<string> => spec !== undefined);
  if (!grammar || applicable.length === 0) return rules.map(() => null);
  const flows = await analyzeFlowsWithSpecs(grammar, applicable, content);
  let next = 0;
  return specs.map((spec) => (spec ? flows[next++] : null));
}

/** Rule specs for a grammar, keyed by rule ID, for the project-wide analysis. */
const ruleSpecs = (rules: readonly CompiledTaintRule[]): SpecsFor => (grammar) =>
  rules.flatMap((rule) => {
    const spec = rule.specs.get(grammar);
    return spec ? [{ key: rule.id, spec }] : [];
  });

/**
 * Summaries of every function in the project for these rules, so calls into other files are
 * followed. Build it once per workspace scan and reuse it for single files until the next scan.
 */
export async function buildTaintRuleIndex(rules: readonly CompiledTaintRule[], files: ReadonlyArray<{ path: string; language: string }>, read: (path: string) => Promise<string>): Promise<FlowIndex> {
  const project = files.flatMap((file) => {
    const grammar = flowGrammarFor(file.language, file.path);
    return grammar ? [{ path: file.path, grammar }] : [];
  });
  return buildFlowIndex(project, ruleSpecs(rules), read);
}

/** `analyzeTaintRules` with calls into other files followed through a project index. */
export async function analyzeTaintRulesWithIndex(index: FlowIndex, rules: readonly CompiledTaintRule[], language: string, filePath: string, content: string): Promise<Array<DataFlow<string>[] | null>> {
  const grammar = flowGrammarFor(language, filePath);
  const covered = rules.map((rule) => Boolean(grammar && rule.kind === 'taint' && taintRuleCovers(rule, language) && rule.specs.has(grammar)));
  if (!grammar || !covered.some(Boolean)) return rules.map(() => null);
  const results = await analyzeFileWithIndex(index, { path: filePath, grammar }, content, ruleSpecs(rules.filter((_, index) => covered[index])));
  return rules.map((rule, index) => (covered[index] ? results.get(rule.id) ?? [] : null));
}

/**
 * Endpoints of one file for each access (BOLA) rule, or null for rules of another kind or language.
 * With a project index, lookups in other files called from a handler are followed.
 */
export async function analyzeAccessRules(rules: readonly CompiledTaintRule[], language: string, filePath: string, content: string, index?: FlowIndex): Promise<Array<AccessEndpoint[] | null>> {
  const grammar = flowGrammarFor(language, filePath);
  const results: Array<AccessEndpoint[] | null> = [];
  for (const rule of rules) {
    if (!grammar || rule.kind !== 'access' || !taintRuleCovers(rule, language) || !rule.specs.has(grammar)) {
      results.push(null);
      continue;
    }
    results.push(index
      ? await analyzeAccessWithIndex(index, { path: filePath, grammar }, content, rule.access, rule.id)
      : await analyzeAccess(grammar, content, rule.access));
  }
  return results;
}
