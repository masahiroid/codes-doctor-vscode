import type { LanguageSyntaxSpec } from '../syntax/spec';
import { namedChildren, Node, walk, withSyntaxTree } from '../syntax/treeSitter';

/** What a syntax tree tells the security scan about one file. */
export interface SecurityEvidence {
  /** Comments, and string literals outside import statements: text, not code. */
  textRanges: Array<[number, number]>;
  /** Offsets of the `(` of calls whose arguments are all literals. */
  literalCallParens: Set<number>;
}

/** Whether a node is a constant value: a literal, or a list/keyword argument made only of literals. */
function isLiteral(spec: LanguageSyntaxSpec, node: Node): boolean {
  if (spec.stringTypes.has(node.type)) {
    // An interpolated string (`f"{cmd}"`, `$"{cmd}"`) is built from code.
    let interpolated = false;
    walk(node, (child) => {
      if (/interpolation/.test(child.type) && child !== node) interpolated = true;
      return !interpolated;
    });
    return !interpolated;
  }
  if (spec.literalTypes.has(node.type)) return true;
  if (node.type === 'keyword_argument') {
    const value = node.childForFieldName('value');
    return value !== null && isLiteral(spec, value);
  }
  if (spec.containerTypes.has(node.type)) {
    return namedChildren(node)
      .filter((child) => child.type !== 'comment' && !/type/.test(child.type))
      .every((child) => isLiteral(spec, child));
  }
  return false;
}

function insideImport(spec: LanguageSyntaxSpec, node: Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (spec.importTypes.has(current.type)) return true;
  }
  return false;
}

export async function securityEvidence(spec: LanguageSyntaxSpec, content: string): Promise<SecurityEvidence> {
  return withSyntaxTree(spec.grammar, content, (tree) => {
    const textRanges: Array<[number, number]> = [];
    const literalCallParens = new Set<number>();
    walk(tree.rootNode, (node) => {
      if (spec.commentTypes.has(node.type) || (spec.stringTypes.has(node.type) && !insideImport(spec, node))) {
        textRanges.push([node.startIndex, node.endIndex]);
      }
      if (spec.callTypes.has(node.type)) {
        const args = node.childForFieldName(spec.argumentsField);
        if (args && namedChildren(args).every((argument) => argument.type === 'comment' || isLiteral(spec, argument))) {
          literalCallParens.add(args.startIndex);
        }
      }
      return true;
    });
    return { textRanges, literalCallParens };
  });
}
