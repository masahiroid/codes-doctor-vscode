import type { LanguageSyntaxSpec } from '../spec';
import { namedChildren } from '../treeSitter';
import { fieldText, set } from './common';

const TYPE_DECLARATIONS = set('class_declaration', 'interface_declaration', 'enum_declaration', 'record_declaration', 'annotation_type_declaration');
const METHOD_DECLARATIONS = set('method_declaration', 'constructor_declaration', 'compact_constructor_declaration');

export const JAVA_SYNTAX: LanguageSyntaxSpec = {
  grammar: 'java',
  typeDeclaration: (node) => (TYPE_DECLARATIONS.has(node.type) ? { name: fieldText(node, 'name') ?? '', body: node.childForFieldName('body') } : null),
  functionName: (node) => (METHOD_DECLARATIONS.has(node.type) ? fieldText(node, 'name') : null),
  parameters: (node) => node.childForFieldName('parameters'),
  isField: (node) => node.type === 'field_declaration' || node.type === 'constant_declaration',
  fieldCount: (node) => Math.max(1, node.childrenForFieldName('declarator').length),
  imports: (node) => (node.type === 'import_declaration' ? namedChildren(node).filter((child) => child.type !== 'asterisk').map((child) => child.text) : null),
  hasConstructor: (typeName, methods) => methods.includes(typeName),
  commentTypes: set('line_comment', 'block_comment'),
  stringTypes: set('string_literal', 'text_block', 'character_literal'),
  literalTypes: set('decimal_integer_literal', 'hex_integer_literal', 'decimal_floating_point_literal', 'true', 'false', 'null_literal'),
  containerTypes: set('array_initializer'),
  callTypes: set('method_invocation', 'object_creation_expression'),
  argumentsField: 'arguments',
  importTypes: set('import_declaration'),
};
