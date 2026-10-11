import type { LanguageSyntaxSpec } from '../spec';
import type { Node } from '../treeSitter';
import { fieldText, set, unquote } from './common';

const DECLARATOR_WRAPPERS = set('pointer_declarator', 'reference_declarator', 'parenthesized_declarator', 'attributed_declarator');

/** The function_declarator inside a declarator chain (`T* Foo::bar(int) const`). */
function functionDeclarator(declarator: Node | null): Node | null {
  let current = declarator;
  while (current && DECLARATOR_WRAPPERS.has(current.type)) current = current.childForFieldName('declarator');
  return current?.type === 'function_declarator' ? current : null;
}

/** The declared name node of a function: identifier, qualified Type::name, operator, destructor. */
function declaredName(node: Node): Node | null {
  if (node.type !== 'function_definition' && node.type !== 'field_declaration' && node.type !== 'declaration') return null;
  return functionDeclarator(node.childForFieldName('declarator'))?.childForFieldName('declarator') ?? null;
}

/** `Type::method` -> `method`, with template arguments dropped. */
function lastSegment(name: Node): string {
  if (name.type === 'qualified_identifier') {
    const inner = name.childForFieldName('name');
    return inner ? lastSegment(inner) : name.text;
  }
  return name.text.replace(/<[\s\S]*>$/, '');
}

export const CPP_SYNTAX: LanguageSyntaxSpec = {
  grammar: 'cpp',
  typeDeclaration(node) {
    if (node.type !== 'class_specifier' && node.type !== 'struct_specifier') return null;
    const body = node.childForFieldName('body');
    const name = fieldText(node, 'name');
    // `struct Foo;` and `struct Foo x;` are references, not declarations.
    return body && name ? { name: name.replace(/<[\s\S]*>$/, ''), body } : null;
  },
  /** Definitions anywhere, plus method declarations inside a class body. */
  functionName(node) {
    // Prototypes count only inside a class body; there, constructors (no return type)
    // parse as `declaration` and other methods as `field_declaration`.
    const inClassBody = node.parent?.type === 'field_declaration_list';
    if ((node.type === 'declaration' || node.type === 'field_declaration') && !inClassBody) return null;
    const name = declaredName(node);
    return name ? lastSegment(name) : null;
  },
  parameters: (node) => functionDeclarator(node.childForFieldName('declarator'))?.childForFieldName('parameters') ?? null,
  isField: (node) => node.type === 'field_declaration' && !declaredName(node),
  fieldCount: (node) => Math.max(1, node.childrenForFieldName('declarator').length),
  externalMethodOwner(node) {
    if (node.type !== 'function_definition') return null;
    const name = declaredName(node);
    const scope = name?.type === 'qualified_identifier' ? name.childForFieldName('scope') : null;
    return scope ? scope.text.replace(/<[\s\S]*>$/, '').split('::').pop() ?? null : null;
  },
  imports: (node) => (node.type === 'preproc_include' ? [unquote(fieldText(node, 'path') ?? '')] : null),
  hasConstructor: (typeName, methods) => methods.includes(typeName),
  commentTypes: set('comment'),
  stringTypes: set('string_literal', 'raw_string_literal', 'char_literal', 'concatenated_string', 'system_lib_string'),
  literalTypes: set('number_literal', 'true', 'false', 'null', 'nullptr'),
  containerTypes: set('initializer_list'),
  callTypes: set('call_expression'),
  argumentsField: 'arguments',
  importTypes: set('preproc_include'),
};
