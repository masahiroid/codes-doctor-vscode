import type { Node } from '../syntax/treeSitter';
import type { GrammarId } from '../syntax/treeSitter';

/** Kinds of dangerous operation the flow analysis looks for. */
export type SinkCategory = 'Command Injection' | 'SQL Injection' | 'Code Injection' | 'Path Traversal' | 'SSRF' | 'XSS';

export interface SinkRule {
  category: SinkCategory;
  /** Matched against the call's callee text (everything before the argument list). */
  callee: RegExp;
  /** Only this argument matters (e.g. the query string of a parameterized SQL call); all arguments when absent. */
  argument?: number;
}

/**
 * How one language expresses data flow in its Tree-sitter grammar: where untrusted input
 * enters, how values move between variables, and which calls are dangerous with it.
 */
export interface FlowSpec {
  /** Function-like nodes: each is analyzed on its own (intraprocedural analysis). */
  functionTypes: ReadonlySet<string>;
  /** Nodes that name a variable (`x`, `$x`). */
  identifierTypes: ReadonlySet<string>;
  /** Assignment-like nodes: the names written and the value written to them. */
  assignment(node: Node): { targets: Node | null; value: Node | null; compound: boolean } | null;
  callTypes: ReadonlySet<string>;
  /** Untrusted input expressions, matched against a node's text (`r.URL.Query()`, `$_GET`). */
  sources: RegExp;
  /** Calls whose result is safe to use regardless of input (`strconv.Atoi`, `escapeshellarg`). */
  sanitizers: RegExp;
  sinks: readonly SinkRule[];
  /** Assignments that are sinks themselves (`el.innerHTML = value`). */
  sinkAssignments?: ReadonlyArray<{ category: SinkCategory; target: RegExp }>;
  /** Statements that are sinks for any value inside them (PHP `echo`). */
  sinkStatements?: ReadonlyArray<{ category: SinkCategory; type: string }>;
}

/** Grammar to parse a file with, from its language and extension. */
export type FlowGrammar = Extract<GrammarId, 'go' | 'python' | 'java' | 'csharp' | 'rust' | 'cpp' | 'javascript' | 'typescript' | 'tsx' | 'php'>;
