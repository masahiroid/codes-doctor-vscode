import type { Node } from './treeSitter';
import type { GrammarId } from './treeSitter';

/** A function or method found in a syntax tree. */
export interface FunctionSyntax {
  name: string;
  node: Node;
}

/**
 * How to read one language's syntax tree into the engine's file structure. Node type
 * names come from the language's Tree-sitter grammar.
 */
export interface LanguageSyntaxSpec {
  grammar: GrammarId;
  /** Type declarations (class, struct, interface, ...): returns name and body, or null if `node` is not one. */
  typeDeclaration(node: Node): { name: string; body: Node | null } | null;
  /** Function-like declarations; returns the declared name, or null if `node` is not one. */
  functionName(node: Node): string | null;
  /** Node holding a function's parameter list. */
  parameters(node: Node): Node | null;
  /** Whether a node directly inside a type body declares a field/property. */
  isField(node: Node): boolean;
  /** Fields declared by a field node (one declaration can declare several). */
  fieldCount?(node: Node): number;
  /** Fields assigned inside method bodies (Python `self.x = ...`), counted per type. */
  instanceFields?(typeBody: Node): number;
  /** Methods declared outside their type's body: Go receivers, Rust impl blocks, C++ `Type::method`. */
  externalMethodOwner?(node: Node, functionNode: Node): string | null;
  /**
   * Whether an external method's owner is always a type (Go receivers, Rust impl blocks).
   * When false (C++ `Scope::name`, where the scope may be a namespace), the method is only
   * credited to a type declared in the same file and is otherwise a plain function.
   */
  externalOwnersAreTypes?: boolean;
  /** Nodes that hold methods for another type without being a type (Rust impl blocks). */
  methodContainer?(node: Node): string | null;
  /** Import/use/include targets declared by a node, or null if it is not an import. */
  imports(node: Node): string[] | null;
  /** Whether a type has an explicit constructor, given its methods and the file's functions. */
  hasConstructor(typeName: string, methods: readonly string[], functions: readonly string[]): boolean;
  /** Parameters that are not real arguments (Python `self`/`cls`). */
  isImplicitParameter?(node: Node): boolean;
  /** Comment node types and string-literal node types, for the security scan. */
  commentTypes: ReadonlySet<string>;
  stringTypes: ReadonlySet<string>;
  /** Literal values other than strings (numbers, booleans, ...), for the security scan. */
  literalTypes: ReadonlySet<string>;
  /** Array/list/tuple literal node types whose elements may all be literals. */
  containerTypes: ReadonlySet<string>;
  /** Call expression node types and the field holding their arguments. */
  callTypes: ReadonlySet<string>;
  argumentsField: string;
  /** Nodes whose strings name code rather than data (imports), kept in the security scan. */
  importTypes: ReadonlySet<string>;
}
