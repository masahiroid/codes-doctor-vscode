import type { LanguageSyntaxSpec } from '../spec';
import { namedChildren } from '../treeSitter';
import { baseTypeName, fieldText, set, unquote } from './common';

/** Go convention: `NewX` constructs an X. */
const CONSTRUCTOR_PREFIX = 'New';

/**
 * Go has no classes: a struct type plus the methods whose receiver is that type form
 * the class-like unit, even when the methods live in other files.
 */
export const GO_SYNTAX: LanguageSyntaxSpec = {
  grammar: 'go',
  typeDeclaration(node) {
    if (node.type !== 'type_spec') return null;
    const type = node.childForFieldName('type');
    if (type?.type !== 'struct_type') return null;
    return { name: fieldText(node, 'name') ?? '', body: namedChildren(type)[0] ?? null };
  },
  functionName: (node) => (node.type === 'function_declaration' || node.type === 'method_declaration' ? fieldText(node, 'name') : null),
  parameters: (node) => node.childForFieldName('parameters'),
  isField: (node) => node.type === 'field_declaration',
  fieldCount: (node) => Math.max(1, node.childrenForFieldName('name').length),
  externalOwnersAreTypes: true,
  externalMethodOwner(node) {
    if (node.type !== 'method_declaration') return null;
    const receiver = namedChildren(node.childForFieldName('receiver')!)[0];
    return baseTypeName(receiver?.childForFieldName('type') ?? null);
  },
  imports: (node) => (node.type === 'import_spec' ? [unquote(fieldText(node, 'path') ?? '')] : null),
  hasConstructor: (typeName, _methods, functions) => functions.includes(CONSTRUCTOR_PREFIX + typeName),
  commentTypes: set('comment'),
  stringTypes: set('interpreted_string_literal', 'raw_string_literal', 'rune_literal'),
  literalTypes: set('int_literal', 'float_literal', 'imaginary_literal', 'true', 'false', 'nil'),
  containerTypes: set('composite_literal', 'literal_value', 'literal_element'),
  callTypes: set('call_expression'),
  argumentsField: 'arguments',
  importTypes: set('import_declaration', 'import_spec', 'import_spec_list'),
};
