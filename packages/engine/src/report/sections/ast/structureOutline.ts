/** A named type (class, struct, ...) with optional member details. */
export interface OutlineType {
  name: string;
  /** Count lines such as `フィールド: 3`, shown only when the count is non-zero. */
  counts?: Array<{ label: string; value: number }>;
  methods?: string[];
}

export type OutlineGroup =
  | { kind: 'names'; heading: string; items: string[]; suffix?: string }
  | { kind: 'types'; heading: string; types: OutlineType[] };

const GROUP_INDENT = '  ';
const ITEM_INDENT = '    ';
const MEMBER_INDENT = '      ';

/** Render a file's complete structure as the indented outline shown in the AST section. */
export function renderOutline(groups: OutlineGroup[]): string {
  const lines = ['ファイル'];
  for (const group of groups) {
    if (group.kind === 'names') {
      lines.push(`${GROUP_INDENT}${group.heading} (${group.items.length})`);
      lines.push(...group.items.map((item) => `${ITEM_INDENT}- ${item}${group.suffix ?? ''}`));
      continue;
    }
    lines.push(`${GROUP_INDENT}${group.heading} (${group.types.length})`);
    lines.push(...group.types.flatMap((type) => [`${ITEM_INDENT}- ${type.name}`, ...typeMemberLines(type)]));
  }
  return lines.join('\n');
}

function typeMemberLines(type: OutlineType): string[] {
  const counts = (type.counts ?? [])
    .filter((count) => count.value > 0)
    .map((count) => `${MEMBER_INDENT}- ${count.label}: ${count.value}`);
  const methods = (type.methods ?? []).map((method) => `${MEMBER_INDENT}- メソッド: ${method}()`);
  return [...counts, ...methods];
}
