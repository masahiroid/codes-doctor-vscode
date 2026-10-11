import phpParser from 'php-parser';
import { readFileContent } from '../../fileWalker';

const parser: any = new (phpParser as any).Engine({
  parser: {
    php7: true,
    extractDoc: false,
  },
  ast: {
    withPositions: true,
  },
});

export interface ParsedPhpFile {
  ast: any;
  content: string;
}

export async function parsePhpFile(filePath: string): Promise<ParsedPhpFile | null> {
  const content = await readFileContent(filePath);
  if (!content) {
    return null;
  }

  try {
    const ast = parser.parseCode(content, filePath);
    return { ast, content };
  } catch (error) {
    console.warn(`Warning: Failed to parse PHP file ${filePath}:`, error);
    return null;
  }
}

export function traversePhpAst(
  node: any,
  enter?: (node: any) => void,
  exit?: (node: any) => void
): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      traversePhpAst(item, enter, exit);
    }
    return;
  }

  if (typeof node !== 'object') return;

  if (enter) enter(node);

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') {
      continue;
    }
    traversePhpAst((node as any)[key], enter, exit);
  }

  if (exit) exit(node);
}

export function getIdentifierName(node: any): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node;

  if (typeof node.name === 'string') return node.name;
  if (node.kind === 'identifier' && typeof node.name === 'string') return node.name;

  if (node.kind === 'name') {
    if (typeof node.name === 'string') return node.name;
    if (Array.isArray(node.name)) return node.name.join('\\');
    if (Array.isArray(node.parts)) return node.parts.join('\\');
  }

  if (node.value !== undefined) return String(node.value);

  return null;
}

export function getQualifiedName(node: any): string | null {
  if (!node) return null;
  if (typeof node === 'string') return node;

  if (node.kind === 'name') {
    if (Array.isArray(node.name)) return node.name.join('\\');
    if (Array.isArray(node.parts)) return node.parts.join('\\');
  }

  return getIdentifierName(node);
}

export function getNodeLineCount(node: any): number {
  const start = node?.loc?.start?.line;
  const end = node?.loc?.end?.line;
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    return end - start + 1;
  }
  return 0;
}
