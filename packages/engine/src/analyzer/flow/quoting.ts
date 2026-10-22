import type { Node } from '../syntax/treeSitter';
import { walk } from '../syntax/treeSitter';

/** Literal text nodes inside strings and templates. */
const STRING_CONTENT_TYPES = new Set(['string_content', 'string_fragment', 'string_value']);
/** Nodes that build a string around a value: interpolating strings and templates. */
const STRING_BUILDER_TYPES = new Set(['encapsed_string', 'string', 'template_string', 'template_substitution', 'heredoc', 'heredoc_body']);
/** Binary operators that concatenate strings. */
const CONCATENATION = new Set(['.', '+']);

/**
 * Where `target` sits in the string it is built into: not in a string at all, inside quotes,
 * or outside quotes. Only the string around it counts (its concatenation chain, interpolating
 * string or template), not unrelated literals such as array keys or other arguments.
 */
export function quoting(root: Node, target: Node): 'bare' | 'quoted' | 'unquoted' {
  let builder: Node | null = null;
  for (let current = target.parent; current && current.startIndex >= root.startIndex && current.endIndex <= root.endIndex; current = current.parent) {
    const concatenation = current.type === 'binary_expression' && CONCATENATION.has(current.childForFieldName('operator')?.text ?? '');
    if (concatenation || STRING_BUILDER_TYPES.has(current.type)) builder = current;
    else if (current.type !== 'parenthesized_expression') break;
  }
  if (!builder) return 'bare';
  let literal = '';
  walk(builder, (current) => {
    if (current.startIndex >= target.startIndex) return false;
    if (STRING_CONTENT_TYPES.has(current.type)) literal += current.text;
    return true;
  });
  if (!literal) return 'bare';
  const unescaped = literal.replace(/\\./g, '');
  const odd = (quote: string) => unescaped.split(quote).length % 2 === 0;
  return odd("'") || odd('"') ? 'quoted' : 'unquoted';
}
