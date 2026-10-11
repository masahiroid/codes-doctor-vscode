import { AST_SECTION_LIMITS } from './limits';
import { parseTypeScriptAst } from './parsers';
import { OutlineType, renderOutline } from './structureOutline';

/** Top-level imports, classes (fields + methods) and functions of a TS/JS file. */
export function buildTypeScriptStructure(content: string): string {
  const ast = parseTypeScriptAst(content);
  const imports: string[] = [];
  const classes: OutlineType[] = [];
  const functions: string[] = [];

  for (const node of ast.body || []) {
    if (node.type === 'ImportDeclaration' && node.source) {
      imports.push(String((node.source as any).value));
    }
    if (node.type === 'ClassDeclaration' && node.id) {
      classes.push(describeClass(node));
    }
    if (node.type === 'FunctionDeclaration' && (node as any).id) {
      functions.push(String((node as any).id.name));
    }
  }

  return renderOutline([
    { kind: 'names', heading: 'Imports', items: imports, limit: AST_SECTION_LIMITS.listItems },
    { kind: 'types', heading: 'Classes', types: classes, limit: AST_SECTION_LIMITS.classes },
    { kind: 'names', heading: 'Functions', items: functions, limit: AST_SECTION_LIMITS.listItems, suffix: '()' },
  ]);
}

function describeClass(node: any): OutlineType {
  const methods: string[] = [];
  let fields = 0;
  for (const member of node.body?.body || []) {
    if (member.type === 'MethodDefinition') {
      const methodName = member.key?.name || member.key?.value;
      if (methodName) methods.push(String(methodName));
    } else if (member.type === 'PropertyDefinition') {
      fields += 1;
    }
  }
  return { name: node.id.name, counts: [{ label: 'fields', value: fields }], methods };
}
