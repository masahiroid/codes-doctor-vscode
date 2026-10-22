import type { Node } from '../syntax/treeSitter';
import { namedChildren, walk } from '../syntax/treeSitter';
import type { FlowSpec } from './spec';

/** Stateless reading of calls, functions and parameters, shared by the flow analysis passes. */

/** Name of a function node: its `name` field, the C/C++ declarator, or the variable it is assigned to. */
export function functionName(scope: Node): string | undefined {
  const name = scope.childForFieldName('name');
  if (name) return name.text;
  let declarator = scope.childForFieldName('declarator');
  while (declarator?.childForFieldName('declarator')) declarator = declarator.childForFieldName('declarator');
  if (declarator) return declarator.text.split(/::|\./).at(-1);
  const parent = scope.parent;
  if (parent?.type === 'variable_declarator') return parent.childForFieldName('name')?.text;
  if (parent?.type === 'assignment_expression' || parent?.type === 'pair') {
    return (parent.childForFieldName('left') ?? parent.childForFieldName('key'))?.text.split('.').at(-1);
  }
  return undefined;
}

/** Name a call refers to: the last segment of `helper`, `this.helper`, `$this->helper`, `self::helper`. */
export const calledName = (callee: string) => callee.split(/->|::|\.|\?\./).at(-1)?.trim() ?? '';

/** Expression text compared across occurrences: whitespace dropped and quotes unified. */
export const normalize = (text: string) => text.replace(/\s+/g, '').replace(/"/g, "'");

/** Callee text of a call: everything before its argument list. */
export function calleeText(call: Node): string {
  // Without an argument list (include/require), the callee is the keyword before the operand.
  const args = call.childForFieldName('arguments') ?? namedChildren(call).at(-1) ?? null;
  const end = args ? args.startIndex - call.startIndex : call.text.length;
  return call.text.slice(0, end).replace(/\s+/g, ' ').trim();
}

export function callArguments(call: Node): Node[] {
  const args = call.childForFieldName('arguments');
  if (!args) {
    // include/require and similar take one operand instead of an argument list.
    return namedChildren(call).slice(-1);
  }
  return namedChildren(args).filter((arg) => !/comment/.test(arg.type)).map((arg) => (arg.type === 'argument' ? namedChildren(arg)[0] ?? arg : arg));
}

/** Parameter names of a function, one entry per position (destructuring yields several names). */
export function parameterNames(spec: FlowSpec<string>, scope: Node): string[][] {
  const list = scope.childForFieldName('parameters') ?? scope.childForFieldName('parameter');
  if (!list) return [];
  const params = spec.identifierTypes.has(list.type) ? [list] : namedChildren(list).filter((child) => !/comment/.test(child.type));
  return params.map((param) => {
    const names: string[] = [];
    walk(param, (node) => {
      // Default values are not names.
      if (node !== param && (node.type === 'assignment_pattern' || node.type === 'default_value')) {
        const left = node.childForFieldName('left');
        if (left) names.push(left.text);
        return false;
      }
      if (spec.identifierTypes.has(node.type) && !/type/.test(node.parent?.type ?? '')) names.push(node.text);
      return !spec.identifierTypes.has(node.type);
    });
    return names;
  });
}
