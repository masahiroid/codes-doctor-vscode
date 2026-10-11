import type { LanguageSyntaxSpec } from '../spec';
import { namedChildren, walk } from '../treeSitter';
import { fieldText, set } from './common';

const TYPE_DECLARATIONS = set('class_declaration', 'struct_declaration', 'interface_declaration', 'record_declaration', 'record_struct_declaration');
const METHOD_DECLARATIONS = set('method_declaration', 'constructor_declaration', 'destructor_declaration', 'operator_declaration');

export const CSHARP_SYNTAX: LanguageSyntaxSpec = {
  grammar: 'csharp',
  typeDeclaration: (node) => (TYPE_DECLARATIONS.has(node.type) ? { name: fieldText(node, 'name') ?? '', body: node.childForFieldName('body') } : null),
  functionName: (node) => (METHOD_DECLARATIONS.has(node.type) ? fieldText(node, 'name') ?? node.type : null),
  parameters: (node) => node.childForFieldName('parameters'),
  isField: (node) => node.type === 'field_declaration' || node.type === 'property_declaration' || node.type === 'event_field_declaration',
  fieldCount(node) {
    if (node.type === 'property_declaration') return 1;
    let declarators = 0;
    walk(node, (child) => {
      if (child.type === 'variable_declarator') declarators += 1;
      return true;
    });
    return Math.max(1, declarators);
  },
  imports: (node) => (node.type === 'using_directive' ? namedChildren(node).filter((child) => child.type !== 'identifier' || namedChildren(node).length === 1).map((child) => child.text).slice(-1) : null),
  hasConstructor: (typeName, methods) => methods.includes(typeName),
  commentTypes: set('comment'),
  stringTypes: set('string_literal', 'verbatim_string_literal', 'raw_string_literal', 'interpolated_string_expression', 'character_literal'),
  literalTypes: set('integer_literal', 'real_literal', 'boolean_literal', 'null_literal'),
  containerTypes: set('array_creation_expression', 'implicit_array_creation_expression', 'initializer_expression', 'argument'),
  callTypes: set('invocation_expression', 'object_creation_expression'),
  argumentsField: 'arguments',
  importTypes: set('using_directive'),
};
