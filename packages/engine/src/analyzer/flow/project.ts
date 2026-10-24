import path from 'node:path';
import type { Node } from '../syntax/treeSitter';
import { namedChildren, walk, withSyntaxTree } from '../syntax/treeSitter';
import type { FlowGrammar, FlowSpec } from './spec';
import { FlowAnalysis, byLine, functionScopes } from './taint';
import { accessSpec, analyzeAccess } from './access';
import type { AccessEndpoint, AccessOptions } from './access';
import type { DataFlow, FlowStep, FunctionSummary, SummaryResolver, Taint } from './taint';

/**
 * Cross-file data flow. Every file's function summaries go into a project-wide table, and a call
 * is connected to a function in another file when it can be resolved:
 *
 * - through `import` / `require` of a relative module (JavaScript and TypeScript), or
 * - by name, when exactly one function or method in the project has that name and the call is a
 *   plain call or goes through `this` / `$this` / `self` (PHP has no imports to follow).
 *
 * Calls into packages (`import { query } from 'pg'`) and ambiguous names are not connected, so a
 * library method is never mistaken for a project function.
 */

export interface ProjectFile {
  path: string;
  grammar: FlowGrammar;
}

/** The specs a file is analyzed with, each under a stable key (a rule ID, or one key for built-in rules). */
export type SpecsFor = (grammar: FlowGrammar) => Array<{ key: string; spec: FlowSpec<string> }>;

/** What a local name in a file refers to: an export of a project module, or something outside the project. */
interface Binding {
  /** Absolute path of the project file, or null for a package or an unresolved module. */
  module: string | null;
  /** The exported name; `*` for a namespace or a `require`d module object; `default` for a default import. */
  name: string;
}

export interface FlowIndex {
  /** Local names bound by imports, per absolute file path. */
  readonly bindings: Map<string, Map<string, Binding>>;
  /** Per spec key: summaries per absolute file path and function name, and by name across the project. */
  readonly summaries: Map<string, { byFile: Map<string, Map<string, FunctionSummary>>; byName: Map<string, Array<{ file: string; summary: FunctionSummary }>> }>;
}

const MODULE_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const RECEIVERS = new Set(['this', '$this', 'self', 'static', 'parent']);
const JAVASCRIPT_GRAMMARS = new Set<FlowGrammar>(['javascript', 'typescript', 'tsx']);

const unquote = (text: string) => text.replace(/^['"`]|['"`]$/g, '');

/** Resolve a relative module specifier to a project file; packages and missing files resolve to null. */
function resolveModule(importer: string, specifier: string, files: ReadonlySet<string>): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  // TypeScript sources often import their compiled name: './service.js' for './service.ts'.
  const stems = [base, base.replace(/\.(?:[cm]?js|jsx)$/, '')];
  for (const stem of stems) {
    for (const extension of MODULE_EXTENSIONS) {
      if (files.has(stem + extension)) return stem + extension;
      if (extension && files.has(path.join(stem, `index${extension}`))) return path.join(stem, `index${extension}`);
    }
  }
  return null;
}

/** `import` and `require` bindings of a JavaScript or TypeScript file. */
function collectBindings(root: Node, file: string, files: ReadonlySet<string>): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  walk(root, (node) => {
    if (node.type === 'import_statement') {
      const source = node.childForFieldName('source');
      if (!source) return false;
      const module = resolveModule(file, unquote(source.text), files);
      const clause = namedChildren(node).find((child) => child.type === 'import_clause');
      for (const part of clause ? namedChildren(clause) : []) {
        if (part.type === 'identifier') bindings.set(part.text, { module, name: 'default' });
        if (part.type === 'namespace_import') {
          const local = namedChildren(part).find((child) => child.type === 'identifier');
          if (local) bindings.set(local.text, { module, name: '*' });
        }
        if (part.type === 'named_imports') {
          for (const specifier of namedChildren(part).filter((child) => child.type === 'import_specifier')) {
            const name = specifier.childForFieldName('name')?.text;
            const alias = specifier.childForFieldName('alias')?.text;
            if (name) bindings.set(alias ?? name, { module, name });
          }
        }
      }
      return false;
    }
    if (node.type === 'variable_declarator') {
      const value = node.childForFieldName('value');
      const target = node.childForFieldName('name');
      if (!value || !target || value.type !== 'call_expression' || value.childForFieldName('function')?.text !== 'require') return true;
      const argument = namedChildren(value.childForFieldName('arguments') ?? value)[0];
      if (!argument || !/string/.test(argument.type)) return true;
      const module = resolveModule(file, unquote(argument.text), files);
      if (target.type === 'identifier') bindings.set(target.text, { module, name: '*' });
      if (target.type === 'object_pattern') {
        for (const property of namedChildren(target)) {
          if (property.type === 'shorthand_property_identifier_pattern') bindings.set(property.text, { module, name: property.text });
          if (property.type === 'pair_pattern') {
            const key = property.childForFieldName('key')?.text;
            const local = property.childForFieldName('value')?.text;
            if (key && local) bindings.set(local, { module, name: key });
          }
        }
      }
    }
    return true;
  });
  return bindings;
}

/** A summary from another file, with its lines marked as belonging to that file. */
function stamped(summary: FunctionSummary, file: string): FunctionSummary {
  const mark = (step: FlowStep): FlowStep => (step.file ? step : { ...step, file });
  const taint = (value: Taint | null): Taint | null => (value ? { ...value, source: mark(value.source), steps: value.steps.map(mark) } : null);
  return {
    sinks: summary.sinks.map((sink) => ({ ...sink, sink: mark(sink.sink), steps: sink.steps.map(mark) })),
    returnsParams: new Set(summary.returnsParams),
    returnsSource: taint(summary.returnsSource),
  };
}

/** How calls in one file find summaries of functions in other files, for one spec. */
function resolverFor(index: FlowIndex, key: string, file: string): SummaryResolver {
  const table = index.summaries.get(key);
  const bindings = index.bindings.get(file);
  return (callee) => {
    if (!table) return undefined;
    const parts = callee.replace(/^new\s+/, '').split(/\?\.|->|::|\./).map((part) => part.trim()).filter(Boolean);
    const first = parts[0];
    const last = parts.at(-1);
    if (!first || !last) return undefined;
    const binding = bindings?.get(first);
    if (binding) {
      if (!binding.module) return undefined;
      const exported = table.byFile.get(binding.module);
      if (parts.length === 1) return binding.name === '*' || binding.name === 'default' ? undefined : exported?.get(binding.name);
      return exported?.get(last);
    }
    if (parts.length > 1 && !RECEIVERS.has(first)) return undefined;
    const candidates = table.byName.get(last)?.filter((candidate) => candidate.file !== file) ?? [];
    return candidates.length === 1 ? candidates[0].summary : undefined;
  };
}

const emptyIndex = (): FlowIndex => ({ bindings: new Map(), summaries: new Map() });

/**
 * Summarize every function of the project. Two rounds connect a call to a function in another
 * file whose own summary depends on a third file. Each file is read and parsed once per round.
 */
export async function buildFlowIndex(files: readonly ProjectFile[], specsFor: SpecsFor, read: (file: string) => Promise<string>, rounds = 2): Promise<FlowIndex> {
  const known = new Set(files.map((file) => path.resolve(file.path)));
  let index = emptyIndex();
  for (let round = 0; round < rounds; round++) {
    const next: FlowIndex = { bindings: index.bindings, summaries: new Map() };
    for (const file of files) {
      const absolute = path.resolve(file.path);
      const specs = specsFor(file.grammar);
      if (specs.length === 0) continue;
      let content: string;
      try {
        content = await read(file.path);
      } catch {
        continue;
      }
      await withSyntaxTree(file.grammar, content, (tree) => {
        if (round === 0 && JAVASCRIPT_GRAMMARS.has(file.grammar)) next.bindings.set(absolute, collectBindings(tree.rootNode, absolute, known));
        for (const { key, spec } of specs) {
          const analysis = new FlowAnalysis(spec, content, resolverFor(index, key, absolute));
          analysis.summarize(functionScopes(spec, tree.rootNode));
          let table = next.summaries.get(key);
          if (!table) next.summaries.set(key, (table = { byFile: new Map(), byName: new Map() }));
          const own = new Map<string, FunctionSummary>();
          for (const [name, summary] of analysis.fileSummaries) {
            const exported = stamped(summary, file.path);
            own.set(name, exported);
            table.byName.set(name, [...(table.byName.get(name) ?? []), { file: absolute, summary: exported }]);
          }
          table.byFile.set(absolute, own);
        }
      }).catch(() => undefined);
    }
    index = next;
  }
  return index;
}

/** Flows of one file per spec key, with calls into other files connected through the index. */
export async function analyzeFileWithIndex(index: FlowIndex, file: ProjectFile, content: string, specsFor: SpecsFor): Promise<Map<string, DataFlow<string>[]>> {
  const absolute = path.resolve(file.path);
  const specs = specsFor(file.grammar);
  if (specs.length === 0) return new Map();
  return withSyntaxTree(file.grammar, content, (tree) => {
    const results = new Map<string, DataFlow<string>[]>();
    for (const { key, spec } of specs) {
      const analysis = new FlowAnalysis(spec, content, resolverFor(index, key, absolute));
      const scopes = functionScopes(spec, tree.rootNode);
      analysis.summarize(scopes);
      for (const scope of [tree.rootNode, ...scopes]) analysis.analyzeScope(scope);
      results.set(key, [...analysis.flows.values()].sort(byLine));
    }
    return results;
  });
}


/** Specs for the object-access (BOLA) analysis, under one key. */
export const accessSpecsFor: SpecsFor = (grammar) => {
  const spec = accessSpec(grammar);
  return spec ? [{ key: ACCESS_KEY, spec }] : [];
};
export const ACCESS_KEY = 'object-access';

/** Access endpoints of one file, following lookups in other files through the index. */
export async function analyzeAccessWithIndex(index: FlowIndex, file: ProjectFile, content: string, options: AccessOptions = {}, key = ACCESS_KEY): Promise<AccessEndpoint[]> {
  return analyzeAccess(file.grammar, content, options, resolverFor(index, key, path.resolve(file.path)));
}

module.exports = { buildFlowIndex, analyzeFileWithIndex, accessSpecsFor, ACCESS_KEY, analyzeAccessWithIndex };
