import type { Node } from '../syntax/treeSitter';
import type { GrammarId } from '../syntax/treeSitter';

/** Kinds of dangerous operation the flow analysis looks for. */
export type SinkCategory = 'Command Injection' | 'SQL Injection' | 'Code Injection' | 'Path Traversal' | 'SSRF' | 'XSS';

export interface SinkRule<C extends string = SinkCategory> {
  category: C;
  /** Matched against the call's callee text (everything before the argument list). */
  callee: RegExp;
  /** Only this argument matters (e.g. the query string of a parameterized SQL call); all arguments when absent. */
  argument?: number;
}

/**
 * How one language expresses data flow in its Tree-sitter grammar: where untrusted input
 * enters, how values move between variables, and which calls are dangerous with it.
 */
export interface FlowSpec<C extends string = SinkCategory> {
  /** Function-like nodes: each is analyzed on its own, then connected to its callers in the same file. */
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
  /**
   * Escaping calls that are safe only inside a quoted string literal (`mysqli_real_escape_string`).
   * Their result is clean on its own and inside quotes, but tainted again when it is placed
   * into a string outside quotes (`"WHERE id = $id"`).
   */
  quoteSanitizers?: RegExp;
  /** Validation checks that make an expression clean where they are known to hold. */
  guards?: GuardSpec;
  sinks: readonly SinkRule<C>[];
  /** Assignments that are sinks themselves (`el.innerHTML = value`). */
  sinkAssignments?: ReadonlyArray<{ category: C; target: RegExp }>;
  /** Statements that are sinks for any value inside them (PHP `echo`). */
  sinkStatements?: ReadonlyArray<{ category: C; type: string }>;
}

/**
 * Branch-sensitive validation: inside `if (is_numeric($x))`, in the `else` of `if (!is_numeric($x))`,
 * and after `if (!is_numeric($x)) { exit; }`, the validated expression `$x` is clean.
 */
export interface GuardSpec {
  ifTypes: ReadonlySet<string>;
  /** Statements that leave the enclosing block (`return`, `exit`, `throw`). */
  exitTypes: ReadonlySet<string>;
  /** Calls that end the request when used as a statement (`die(...)`). */
  exitCalls?: RegExp;
  /** Unary node types with a `!` operator. */
  notTypes: ReadonlySet<string>;
  validators: ReadonlyArray<{
    callee: RegExp;
    /** The argument that is validated. */
    argument: number;
    /** Another argument the check depends on, e.g. an anchored pattern for `preg_match`. */
    requires?: { argument: number; text: RegExp };
  }>;
}

/** Grammar to parse a file with, from its language and extension. */
export type FlowGrammar = Extract<GrammarId, 'go' | 'python' | 'java' | 'csharp' | 'rust' | 'cpp' | 'javascript' | 'typescript' | 'tsx' | 'php'>;
