import type { LanguageSyntaxSpec } from '../spec';
import type { Node } from '../treeSitter';
import { namedChildren, walk } from '../treeSitter';
import { fieldText, set } from './common';

const IMPLICIT_PARAMETERS = new Set(['self', 'cls']);
const CONSTRUCTOR = '__init__';

/** Distinct `self.<name> = ...` targets assigned anywhere in a class body's methods. */
function selfAttributes(body: Node): number {
  const names = new Set<string>();
  walk(body, (node) => {
    if (node.type !== 'assignment' && node.type !== 'augmented_assignment') return true;
    const target = node.childForFieldName('left');
    if (target?.type === 'attribute' && target.childForFieldName('object')?.text === 'self') {
      names.add(fieldText(target, 'attribute') ?? '');
    }
    return true;
  });
  return names.size;
}

export const PYTHON_SYNTAX: LanguageSyntaxSpec = {
  grammar: 'python',
  typeDeclaration: (node) => (node.type === 'class_definition' ? { name: fieldText(node, 'name') ?? '', body: node.childForFieldName('body') } : null),
  functionName: (node) => (node.type === 'function_definition' ? fieldText(node, 'name') : null),
  parameters: (node) => node.childForFieldName('parameters'),
  isImplicitParameter: (node) => node.type === 'identifier' && IMPLICIT_PARAMETERS.has(node.text),
  /** Class-level attributes: `name = value` directly in the class body. */
  isField: (node) => node.type === 'expression_statement' && namedChildren(node)[0]?.type === 'assignment' && node.parent?.parent?.type === 'class_definition',
  instanceFields: selfAttributes,
  imports(node) {
    if (node.type === 'import_statement') {
      return node.childrenForFieldName('name')
        .filter((name): name is Node => name !== null)
        .map((name) => (name.type === 'aliased_import' ? fieldText(name, 'name') ?? '' : name.text));
    }
    if (node.type === 'import_from_statement') return [fieldText(node, 'module_name') ?? ''];
    return null;
  },
  hasConstructor: (_typeName, methods) => methods.includes(CONSTRUCTOR),
  commentTypes: set('comment'),
  stringTypes: set('string', 'concatenated_string'),
  literalTypes: set('integer', 'float', 'true', 'false', 'none'),
  containerTypes: set('list', 'tuple'),
  callTypes: set('call'),
  argumentsField: 'arguments',
  importTypes: set('import_statement', 'import_from_statement'),
};
