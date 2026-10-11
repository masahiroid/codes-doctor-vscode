import { AST_SECTION_LIMITS } from './limits';

/** A named type (class, struct, ...) with optional member details. */
export interface OutlineType {
  name: string;
  /** Count lines such as `fields: 3`, shown only when the count is non-zero. */
  counts?: Array<{ label: string; value: number }>;
  methods?: string[];
}

export type OutlineGroup =
  | { kind: 'names'; heading: string; items: string[]; limit: number; truncate?: boolean; suffix?: string }
  | { kind: 'types'; heading: string; types: OutlineType[]; limit: number };

const GROUP_INDENT = '  ';
const ITEM_INDENT = '    ';
const MEMBER_INDENT = '      ';

/** Render a file's structure as the indented outline shown in the AST section. */
export function renderOutline(groups: OutlineGroup[]): string {
  const lines = ['File'];
  for (const group of groups) {
    if (group.kind === 'names') {
      lines.push(`${GROUP_INDENT}${group.heading} (${group.items.length})`);
      lines.push(...limitedList(group.items.map((item) => `${ITEM_INDENT}- ${item}${group.suffix ?? ''}`), group.limit, ITEM_INDENT, group.truncate !== false));
      continue;
    }
    lines.push(`${GROUP_INDENT}${group.heading} (${group.types.length})`);
    const typeLines = group.types.map((type) => [`${ITEM_INDENT}- ${type.name}`, ...typeMemberLines(type)]);
    lines.push(...typeLines.slice(0, group.limit).flat());
    if (group.types.length > group.limit) lines.push(moreLine(ITEM_INDENT, group.types.length - group.limit));
  }
  return lines.join('\n');
}

function typeMemberLines(type: OutlineType): string[] {
  const counts = (type.counts ?? [])
    .filter((count) => count.value > 0)
    .map((count) => `${MEMBER_INDENT}- ${count.label}: ${count.value}`);
  const methods = (type.methods ?? []).map((method) => `${MEMBER_INDENT}- method: ${method}()`);
  return [...counts, ...limitedList(methods, AST_SECTION_LIMITS.methods, MEMBER_INDENT, true)];
}

function limitedList(lines: string[], limit: number, indent: string, truncate: boolean): string[] {
  const shown = lines.slice(0, limit);
  return truncate && lines.length > limit ? [...shown, moreLine(indent, lines.length - limit)] : shown;
}

function moreLine(indent: string, hidden: number): string {
  return `${indent}... (${hidden} more)`;
}
