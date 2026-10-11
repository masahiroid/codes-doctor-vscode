import type { Node } from '../treeSitter';
import { namedChildren } from '../treeSitter';

/** Text of a field's node, or null. */
export function fieldText(node: Node, field: string): string | null {
  return node.childForFieldName(field)?.text ?? null;
}

/** A string literal's value without its quotes or angle brackets. */
export function unquote(text: string): string {
  return text.replace(/^(?:[rRbBuUfF]{0,2})?(["'`<]+)([\s\S]*?)(["'`>]+)$/, '$2');
}

/** Name of a (possibly generic, pointer or reference) type node: `*Foo[T]` -> `Foo`. */
export function baseTypeName(node: Node | null): string | null {
  if (!node) return null;
  if (/^(type_identifier|identifier)$/.test(node.type)) return node.text;
  const inner = node.childForFieldName('type') ?? node.childForFieldName('name') ?? namedChildren(node)[0] ?? null;
  return inner === node ? null : baseTypeName(inner);
}

export const set = (...values: string[]): ReadonlySet<string> => new Set(values);
