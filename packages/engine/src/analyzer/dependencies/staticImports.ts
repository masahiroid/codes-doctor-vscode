/** The subset of an ESTree node that import collection inspects. */
interface ImportSyntaxNode {
  type: string;
  name?: string;
  value?: unknown;
  importKind?: string;
  exportKind?: string;
  params?: ImportSyntaxNode[];
  source?: ImportSyntaxNode;
  callee?: ImportSyntaxNode;
  arguments?: ImportSyntaxNode[];
  [key: string]: unknown;
}

const MODULE_DECLARATIONS = new Set(['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration']);

/**
 * Runtime module specifiers of a file: static imports, re-exports, dynamic `import()`
 * and `require()` calls. Type-only imports and exports are skipped (they disappear at
 * runtime), and `require` is ignored inside functions that shadow it with a parameter.
 */
export function collectStaticImports(ast: unknown): string[] {
  const imports = new Set<string>();
  function visit(input: unknown, shadowed = false): void {
    if (!input || typeof input !== 'object') return;
    const node = input as ImportSyntaxNode;
    if (typeof node.type !== 'string') return;
    if (/Function/.test(node.type) && node.params?.some((p) => p.type === 'Identifier' && p.name === 'require')) shadowed = true;
    if (node.importKind === 'type' || node.exportKind === 'type') return;
    if (MODULE_DECLARATIONS.has(node.type) && typeof node.source?.value === 'string') imports.add(node.source.value);
    if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') imports.add(node.source.value);
    if (!shadowed && isRequireCall(node)) imports.add(node.arguments![0].value as string);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent') continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, shadowed));
      else if (value && typeof value === 'object') visit(value, shadowed);
    }
  }
  visit(ast);
  return [...imports];
}

function isRequireCall(node: ImportSyntaxNode): boolean {
  return node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require' &&
    node.arguments?.length === 1 && typeof node.arguments[0].value === 'string';
}
