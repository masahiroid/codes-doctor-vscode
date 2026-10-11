import { parse, type TSESTree } from '@typescript-eslint/typescript-estree';
import phpParser from 'php-parser';

const TYPESCRIPT_PARSE_OPTIONS = {
  jsx: true,
  loc: true,
  range: true,
  ecmaVersion: 'latest',
  sourceType: 'module',
} as const;

export function parseTypeScriptAst(content: string): TSESTree.Program {
  return parse(content, TYPESCRIPT_PARSE_OPTIONS);
}

export function parsePhpAst(content: string, filePath: string): any {
  const parser: any = new (phpParser as any).Engine({
    parser: { php7: true, extractDoc: false },
    ast: { withPositions: true },
  });
  return parser.parseCode(content, filePath);
}
