import type { Node } from '../syntax/treeSitter';
import { namedChildren, walk, withSyntaxTree } from '../syntax/treeSitter';
import type { FlowGrammar, FlowSpec, SinkCategory } from './spec';
import { FLOW_SPECS } from './languages';

/** A line of code on a data flow. */
export interface FlowStep {
  line: number;
  code: string;
}

/** Untrusted input reaching a dangerous operation, with the lines it passed through. */
export interface DataFlow {
  category: SinkCategory;
  source: FlowStep;
  /** Assignments between the source and the sink, in order. */
  steps: FlowStep[];
  sink: FlowStep;
}

interface Taint {
  source: FlowStep;
  steps: FlowStep[];
}

/** Longest code excerpt kept for a flow step. */
const STEP_CODE_LIMIT = 160;

class FlowAnalysis {
  private readonly lines: string[];
  readonly flows = new Map<string, DataFlow>();

  constructor(private readonly spec: FlowSpec, content: string) {
    this.lines = content.split('\n');
  }

  private step(node: Node): FlowStep {
    const line = node.startPosition.row + 1;
    return { line, code: (this.lines[line - 1] ?? '').trim().slice(0, STEP_CODE_LIMIT) };
  }

  /** Callee text of a call: everything before its argument list. */
  private callee(call: Node): string {
    // Without an argument list (include/require), the callee is the keyword before the operand.
    const args = call.childForFieldName('arguments') ?? namedChildren(call).at(-1) ?? null;
    const end = args ? args.startIndex - call.startIndex : call.text.length;
    return call.text.slice(0, end).replace(/\s+/g, ' ').trim();
  }

  private callArguments(call: Node): Node[] {
    const args = call.childForFieldName('arguments');
    if (!args) {
      // include/require and similar take one operand instead of an argument list.
      return namedChildren(call).slice(-1);
    }
    return namedChildren(args).filter((arg) => !/comment/.test(arg.type)).map((arg) => (arg.type === 'argument' ? namedChildren(arg)[0] ?? arg : arg));
  }

  /**
   * Whether an expression carries untrusted input, and from where. A source is the
   * smallest node matching the language's source pattern; a sanitizer call stops taint.
   */
  private taintOf(node: Node | null, tainted: Map<string, Taint>): Taint | null {
    if (!node) return null;
    let found: Taint | null = null;
    walk(node, (current) => {
      if (found) return false;
      if (this.spec.callTypes.has(current.type) && this.spec.sanitizers.test(this.callee(current))) return false;
      if (this.spec.identifierTypes.has(current.type) && tainted.has(current.text)) {
        found = tainted.get(current.text)!;
        return false;
      }
      if (this.spec.sources.test(current.text)) {
        const narrower = namedChildren(current).some((child) => this.spec.sources.test(child.text));
        if (!narrower) {
          found = { source: this.step(current), steps: [] };
          return false;
        }
      }
      return true;
    });
    return found;
  }

  private targetNames(target: Node | null): string[] {
    if (!target) return [];
    const names = new Set<string>();
    walk(target, (node) => {
      if (this.spec.identifierTypes.has(node.type)) names.add(node.text);
      return true;
    });
    names.add(target.text);
    return [...names];
  }

  private report(category: SinkCategory, taint: Taint, sinkNode: Node): void {
    const sink = this.step(sinkNode);
    const key = `${category}:${sink.line}`;
    // Steps on the source or sink line add nothing to the path.
    const steps = taint.steps.filter((step) => step.line !== taint.source.line && step.line !== sink.line);
    if (!this.flows.has(key)) this.flows.set(key, { category, source: taint.source, steps, sink });
  }

  /** Analyze one function (or the module's top level), not descending into nested functions. */
  analyzeScope(scope: Node): void {
    const tainted = new Map<string, Taint>();
    walk(scope, (node) => {
      if (node !== scope && this.spec.functionTypes.has(node.type)) return false;

      const assignment = this.spec.assignment(node);
      if (assignment) {
        const taint = this.taintOf(assignment.value, tainted);
        const names = this.targetNames(assignment.targets);
        if (taint) {
          const next = { source: taint.source, steps: [...taint.steps, this.step(node)] };
          for (const name of names) tainted.set(name, next);
          for (const rule of this.spec.sinkAssignments ?? []) {
            if (assignment.targets && rule.target.test(assignment.targets.text)) this.report(rule.category, taint, node);
          }
        } else if (!assignment.compound) {
          for (const name of names) tainted.delete(name);
        }
      }

      if (this.spec.callTypes.has(node.type)) {
        const callee = this.callee(node);
        // A call belongs to the first matching rule only; rules are ordered by priority.
        const rule = this.spec.sinks.find((candidate) => candidate.callee.test(callee));
        if (rule) {
          const args = this.callArguments(node);
          const checked = rule.argument === undefined ? args : args.slice(rule.argument, rule.argument + 1);
          const taint = checked.map((arg) => this.taintOf(arg, tainted)).find((found) => found !== null);
          if (taint) this.report(rule.category, taint, node);
        }
      }

      for (const rule of this.spec.sinkStatements ?? []) {
        if (node.type !== rule.type) continue;
        const taint = this.taintOf(node, tainted);
        if (taint) this.report(rule.category, taint, node);
      }
      return true;
    });
  }
}

/**
 * Intraprocedural taint analysis of one file: within each function, follow untrusted
 * input through assignments to dangerous calls. Flows through other functions' return
 * values or parameters are not followed.
 */
export async function analyzeFlows(grammar: FlowGrammar, content: string): Promise<DataFlow[]> {
  const spec = FLOW_SPECS[grammar];
  return withSyntaxTree(grammar, content, (tree) => {
    const analysis = new FlowAnalysis(spec, content);
    const scopes: Node[] = [tree.rootNode];
    walk(tree.rootNode, (node) => {
      if (node !== tree.rootNode && spec.functionTypes.has(node.type)) scopes.push(node);
      return true;
    });
    for (const scope of scopes) analysis.analyzeScope(scope);
    return [...analysis.flows.values()].sort((a, b) => a.sink.line - b.sink.line);
  });
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
