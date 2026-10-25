import type { Node } from '../syntax/treeSitter';
import { namedChildren, walk, withSyntaxTree } from '../syntax/treeSitter';
import type { FlowGrammar, FlowSpec, SinkCategory } from './spec';
import { FLOW_SPECS } from './languages';
import { collectGuards, isValidated } from './guards';
import type { GuardRegion } from './guards';
import { quoting } from './quoting';
import { callArguments, calleeText, calledName, functionName, parameterNames } from './syntax';

/** A line of code on a data flow. */
export interface FlowStep {
  line: number;
  code: string;
  /** Set when the line is in another file than the one analyzed (path as given to the project analysis). */
  file?: string;
  /** For a flow's source: the input expression itself (`req.params.id`), not just its line. */
  expression?: string;
}

/** Untrusted input reaching a dangerous operation, with the lines it passed through. */
export interface DataFlow<C extends string = SinkCategory> {
  category: C;
  source: FlowStep;
  /** Assignments between the source and the sink, in order. */
  steps: FlowStep[];
  sink: FlowStep;
  /**
   * When the dangerous operation is in another file: the call in this file that passes the input
   * there. The flow is reported at this line; `sink` and the later steps carry their file.
   */
  entry?: FlowStep;
  /** Name of the function the flow is in; absent at the top level and in anonymous functions. */
  function?: string;
}

export interface Taint {
  source: FlowStep;
  steps: FlowStep[];
  /** Passed through a quote-dependent escape; harmless until placed into a string outside quotes. */
  escaped?: boolean;
  /** While summarizing a function: the parameter this value came from. */
  param?: number;
}

/**
 * What a function in the same file does with its parameters: which reach a dangerous call
 * inside it, and which (or which input source) its return value carries.
 */
export interface FunctionSummary {
  sinks: Array<{ param: number; category: string; sink: FlowStep; steps: FlowStep[] }>;
  returnsParams: Set<number>;
  returnsSource: Taint | null;
}

/** Finds the summary of a function in another file that a call refers to, by its callee text. */
export type SummaryResolver = (callee: string) => FunctionSummary | undefined;

/** Longest code excerpt kept for a flow step. */
const STEP_CODE_LIMIT = 160;

function createFlowStep(lines: string[], node: Node): FlowStep {
  const line = node.startPosition.row + 1;
  return { line, code: (lines[line - 1] ?? '').trim().slice(0, STEP_CODE_LIMIT) };
}

function extractTargetNames(spec: FlowSpec<string>, target: Node | null): string[] {
  if (!target) return [];
  const names = new Set<string>();
  walk(target, (node) => {
    if (spec.identifierTypes.has(node.type)) names.add(node.text);
    return true;
  });
  names.add(target.text);
  return [...names];
}

/** Manages recorded data flows and summary sinks. */
export class FlowCollector<C extends string> {
  readonly flows = new Map<string, DataFlow<C>>();
  currentFunction: string | undefined;

  record(category: C, taint: Taint, sink: FlowStep, summary: FunctionSummary | null): void {
    if (summary) {
      if (taint.param !== undefined) summary.sinks.push({ param: taint.param, category, sink, steps: taint.steps });
      return;
    }
    const key = `${category}:${sink.line}`;
    // Steps on the source or sink line add nothing to the path.
    const steps = taint.steps.filter((step) => step.line !== taint.source.line && step.line !== sink.line);
    if (this.flows.has(key)) return;
    const flow: DataFlow<C> = { category, source: taint.source, steps, sink };
    if (this.currentFunction) flow.function = this.currentFunction;
    this.flows.set(key, flow);
  }

  recordThroughCall(
    call: Node,
    callee: string,
    tainted: Map<string, Taint>,
    summary: FunctionSummary | null,
    summaryFor: (callee: string) => FunctionSummary | undefined,
    taintOf: (node: Node | null, tainted: Map<string, Taint>) => Taint | null,
    stepOf: (node: Node) => FlowStep
  ): void {
    const targetSummary = summaryFor(callee);
    if (!targetSummary || targetSummary.sinks.length === 0) return;
    const args = callArguments(call);
    for (const inner of targetSummary.sinks) {
      const taint = taintOf(args[inner.param] ?? null, tainted);
      if (!taint || taint.escaped) continue;
      const through: Taint = { ...taint, steps: [...taint.steps, stepOf(call), ...inner.steps] };
      if (summary) {
        if (through.param !== undefined) summary.sinks.push({ param: through.param, category: inner.category, sink: inner.sink, steps: through.steps });
        continue;
      }
      // A sink in another file is reported at the call here; one in this file at the sink itself.
      const entry = inner.sink.file ? stepOf(call) : undefined;
      const at = entry ?? inner.sink;
      const key = `${inner.category}:${at.line}`;
      if (this.flows.has(key)) continue;
      const local = (step: FlowStep) => !step.file && (step.line === through.source.line || step.line === at.line);
      const steps = through.steps.filter((step) => !local(step));
      const flow: DataFlow<C> = { category: inner.category as C, source: through.source, steps, sink: inner.sink };
      if (entry) flow.entry = entry;
      if (this.currentFunction) flow.function = this.currentFunction;
      this.flows.set(key, flow);
    }
  }
}

export class FlowAnalysis<C extends string> {
  private readonly lines: string[];
  private guards: GuardRegion[] = [];
  /** Same-file function summaries, keyed by function name; empty until `summarize` runs. */
  private readonly summaries = new Map<string, FunctionSummary>();
  /** Set while summarizing: findings that start at a parameter are recorded here, not reported. */
  private summary: FunctionSummary | null = null;
  private readonly collector = new FlowCollector<C>();

  constructor(private readonly spec: FlowSpec<C>, content: string, private readonly resolve: SummaryResolver = () => undefined) {
    this.lines = content.split('\n');
  }

  get flows(): Map<string, DataFlow<C>> {
    return this.collector.flows;
  }

  /** Summary for a call: a function of this file first, then one in another file. */
  private summaryFor(callee: string): FunctionSummary | undefined {
    return this.summaries.get(calledName(callee)) ?? this.resolve(callee);
  }

  /** This file's function summaries, for use by other files. */
  get fileSummaries(): ReadonlyMap<string, FunctionSummary> {
    return this.summaries;
  }

  private step(node: Node): FlowStep {
    return createFlowStep(this.lines, node);
  }

  /**
   * Whether an expression carries untrusted input, and from where. A source is the
   * smallest node matching the language's source pattern; a sanitizer call stops taint.
   */
  private taintOf(node: Node | null, tainted: Map<string, Taint>): Taint | null {
    if (!node) return null;
    let found: Taint | null = null;
    // An escaped value counts where it stands alone or sits inside quotes; outside quotes it is live again.
    const settle = (taint: Taint, at: Node) => {
      const context = quoting(node, at);
      if (context === 'bare') found = taint;
      else if (context === 'unquoted') found = { ...taint, escaped: false };
    };
    walk(node, (current) => {
      if (found) return false;
      // A callback passed along runs later with its own inputs; what it reads is not this value.
      if (current !== node && this.spec.functionTypes.has(current.type)) return false;
      if (isValidated(this.guards, current)) return false;
      if (this.spec.callTypes.has(current.type)) {
        const callee = calleeText(current);
        if (this.spec.quoteSanitizers?.test(callee)) {
          const inner = callArguments(current).map((arg) => this.taintOf(arg, tainted)).find((taint) => taint !== null);
          if (inner) settle({ ...inner, escaped: true }, current);
          return false;
        }
        if (this.spec.sanitizers.test(callee)) return false;
        const summary = this.summaryFor(callee);
        if (summary) {
          // The summary says what the call returns; its arguments do not flow into the result otherwise.
          found = this.returnedTaint(summary, current, tainted);
          return false;
        }
      }
      if (this.spec.identifierTypes.has(current.type) && tainted.has(current.text)) {
        const taint = tainted.get(current.text)!;
        if (taint.escaped) settle(taint, current);
        else found = taint;
        return false;
      }
      if (this.spec.sources.test(current.text)) {
        const narrower = namedChildren(current).some((child) => this.spec.sources.test(child.text));
        if (!narrower) {
          found = { source: { ...this.step(current), expression: current.text }, steps: [] };
          return false;
        }
      }
      return true;
    });
    return found;
  }

  /** Taint of a call to a summarized function: its own input source, or a tainted argument it returns. */
  private returnedTaint(summary: FunctionSummary, call: Node, tainted: Map<string, Taint>): Taint | null {
    if (summary.returnsSource) return { ...summary.returnsSource, steps: [...summary.returnsSource.steps, this.step(call)] };
    const args = callArguments(call);
    for (const index of summary.returnsParams) {
      const taint = this.taintOf(args[index] ?? null, tainted);
      if (taint && !taint.escaped) return { ...taint, steps: [...taint.steps, this.step(call)] };
    }
    return null;
  }

  /**
   * Build summaries for the named functions of the file. Two rounds let a helper that calls
   * another helper see that helper's summary.
   */
  summarize(scopes: Node[]): void {
    for (let round = 0; round < 2; round++) {
      for (const scope of scopes) {
        const name = functionName(scope);
        if (!name) continue;
        const summary: FunctionSummary = { sinks: [], returnsParams: new Set(), returnsSource: null };
        const seed = new Map<string, Taint>();
        parameterNames(this.spec, scope).forEach((names, index) => {
          for (const param of names) seed.set(param, { source: this.step(scope), steps: [], param: index });
        });
        this.summary = summary;
        this.analyzeScope(scope, seed);
        this.summary = null;
        this.summaries.set(name, summary);
      }
    }
    this.flows.clear();
  }

  /** Analyze one function (or the module's top level), not descending into nested functions. */
  analyzeScope(scope: Node, seed?: Map<string, Taint>): void {
    this.collector.currentFunction = scope.parent ? functionName(scope) : undefined;
    this.guards = collectGuards(this.spec, scope);
    const tainted = new Map<string, Taint>(seed);
    walk(scope, (node) => {
      if (node !== scope && this.spec.functionTypes.has(node.type)) return false;

      const assignment = this.spec.assignment(node);
      if (assignment) {
        const taint = this.taintOf(assignment.value, tainted);
        const names = extractTargetNames(this.spec, assignment.targets);
        if (taint) {
          const next = { ...taint, steps: [...taint.steps, this.step(node)] };
          for (const name of names) tainted.set(name, next);
          for (const rule of this.spec.sinkAssignments ?? []) {
            if (!taint.escaped && assignment.targets && rule.target.test(assignment.targets.text)) {
              this.collector.record(rule.category, taint, this.step(node), this.summary);
            }
          }
        } else if (!assignment.compound) {
          for (const name of names) tainted.delete(name);
        }
      }

      if (this.spec.callTypes.has(node.type)) {
        const callee = calleeText(node);
        // A call belongs to the first matching rule only; rules are ordered by priority.
        const rule = this.spec.sinks.find((candidate) => candidate.callee.test(callee));
        if (rule) {
          const args = callArguments(node);
          const checked = rule.argument === undefined ? args : args.slice(rule.argument, rule.argument + 1);
          const taint = checked.map((arg) => this.taintOf(arg, tainted)).find((found) => found !== null && !found.escaped);
          if (taint) this.collector.record(rule.category, taint, this.step(node), this.summary);
        } else {
          this.collector.recordThroughCall(
            node,
            callee,
            tainted,
            this.summary,
            (c) => this.summaryFor(c),
            (n, t) => this.taintOf(n, t),
            (n) => this.step(n)
          );
        }
      }

      if (this.summary && node.type === 'return_statement') {
        const taint = this.taintOf(namedChildren(node)[0] ?? null, tainted);
        if (taint && !taint.escaped) {
          if (taint.param !== undefined) this.summary.returnsParams.add(taint.param);
          else this.summary.returnsSource ??= taint;
        }
      }

      for (const rule of this.spec.sinkStatements ?? []) {
        if (node.type !== rule.type) continue;
        const taint = this.taintOf(node, tainted);
        if (taint && !taint.escaped) this.collector.record(rule.category, taint, this.step(node), this.summary);
      }
      return true;
    });
  }
}

/**
 * Taint analysis of one file: within each function, follow untrusted input through
 * assignments to dangerous calls, and across functions of the same file through their
 * summaries. Flows through other files are not followed.
 */
export async function analyzeFlows(grammar: FlowGrammar, content: string): Promise<DataFlow[]> {
  return analyzeFlowsWithSpec(grammar, FLOW_SPECS[grammar], content);
}

/** The same analysis with a caller-supplied spec, e.g. one compiled from a distributed rule. */
export async function analyzeFlowsWithSpec<C extends string>(grammar: FlowGrammar, spec: FlowSpec<C>, content: string): Promise<DataFlow<C>[]> {
  return (await analyzeFlowsWithSpecs(grammar, [spec], content))[0];
}

/** Several specs over one parse of the file; results are in the order of `specs`. */
export async function analyzeFlowsWithSpecs<C extends string>(grammar: FlowGrammar, specs: readonly FlowSpec<C>[], content: string): Promise<DataFlow<C>[][]> {
  return withSyntaxTree(grammar, content, (tree) => specs.map((spec) => {
    const analysis = new FlowAnalysis(spec, content);
    const functions = functionScopes(spec, tree.rootNode);
    analysis.summarize(functions);
    for (const scope of [tree.rootNode, ...functions]) analysis.analyzeScope(scope);
    return [...analysis.flows.values()].sort(byLine);
  }));
}

/** Orders flows by the line they are reported at in their file. */
export const byLine = (a: DataFlow<string>, b: DataFlow<string>) => (a.entry ?? a.sink).line - (b.entry ?? b.sink).line;

/** Function nodes of a file: the scopes the analysis runs over, after the top level. */
export function functionScopes(spec: FlowSpec<string>, root: Node): Node[] {
  const scopes: Node[] = [];
  walk(root, (node) => {
    if (node !== root && spec.functionTypes.has(node.type)) scopes.push(node);
    return true;
  });
  return scopes;
}

/** Grammar for a source file in a security language, or null if flows are not analyzed for it. */
export function flowGrammarFor(language: string, filePath: string): FlowGrammar | null {
  if (language === 'typescript') {
    if (/\.tsx$/i.test(filePath)) return 'tsx';
    if (/\.ts$/i.test(filePath)) return 'typescript';
    return 'javascript';
  }
  return language in FLOW_SPECS ? (language as FlowGrammar) : null;
}
