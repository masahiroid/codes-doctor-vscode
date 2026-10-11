import type { LanguageSyntaxSpec } from '../spec';
import { baseTypeName, fieldText, set } from './common';

const CONSTRUCTOR = 'new';

/** Rust declares methods in `impl` blocks, separately from the struct or enum. */
export const RUST_SYNTAX: LanguageSyntaxSpec = {
  grammar: 'rust',
  typeDeclaration: (node) => (node.type === 'struct_item' || node.type === 'enum_item' || node.type === 'union_item'
    ? { name: fieldText(node, 'name') ?? '', body: node.childForFieldName('body') }
    : null),
  functionName: (node) => (node.type === 'function_item' ? fieldText(node, 'name') : null),
  parameters: (node) => node.childForFieldName('parameters'),
  isImplicitParameter: (node) => node.type === 'self_parameter',
  isField: (node) => node.type === 'field_declaration',
  externalOwnersAreTypes: true,
  methodContainer(node) {
    if (node.type !== 'impl_item') return null;
    const name = baseTypeName(node.childForFieldName('type'));
    // A blanket impl (`impl<T: Trait> Other for T`) targets a type parameter, not a type.
    const typeParameters = node.childForFieldName('type_parameters')?.text ?? '';
    return name && !new RegExp(`[<,\\s]${name}\\b`).test(typeParameters) ? name : null;
  },
  imports: (node) => (node.type === 'use_declaration' ? [fieldText(node, 'argument') ?? ''] : null),
  hasConstructor: (_typeName, methods) => methods.includes(CONSTRUCTOR),
  commentTypes: set('line_comment', 'block_comment'),
  stringTypes: set('string_literal', 'raw_string_literal', 'char_literal'),
  literalTypes: set('integer_literal', 'float_literal', 'boolean_literal'),
  containerTypes: set('array_expression', 'tuple_expression', 'reference_expression'),
  callTypes: set('call_expression'),
  argumentsField: 'arguments',
  importTypes: set('use_declaration'),
};
