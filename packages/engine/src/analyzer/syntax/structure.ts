import type { SimpleClassInfo, SimpleFileInfo, SimpleFunctionInfo } from '../../types';
import { countLines } from '../parsing/sourceText';
import type { LanguageSyntaxSpec } from './spec';
import { namedChildren, Node, walk } from './treeSitter';

interface TypeAccumulator {
  name: string;
  lineCount: number;
  methods: Set<string>;
  propertyCount: number;
}

function lineSpan(node: Node): number {
  return node.endPosition.row - node.startPosition.row + 1;
}

/** Real parameters of a function; one declaration may name several (`a, b int` in Go). */
function parameterCount(spec: LanguageSyntaxSpec, functionNode: Node): number {
  const parameters = spec.parameters(functionNode);
  if (!parameters) return 0;
  return namedChildren(parameters)
    .filter((parameter) => !spec.isImplicitParameter?.(parameter) && parameter.type !== 'comment')
    .reduce((count, parameter) => count + Math.max(1, parameter.childrenForFieldName('name').length), 0);
}

function collectImports(spec: LanguageSyntaxSpec, root: Node): string[] {
  const imports: string[] = [];
  walk(root, (node) => {
    const found = spec.imports(node);
    if (!found) return true;
    imports.push(...found);
    return false;
  });
  return [...new Set(imports)];
}

/**
 * Read a syntax tree into the engine's lightweight file structure: type declarations
 * with their methods and fields, top-level functions, and imports. Methods declared
 * outside their type (Go receivers, Rust impl blocks, C++ `Type::method`) are credited
 * to the type, which is created with no lines if it is declared in another file.
 */
export function extractStructure(spec: LanguageSyntaxSpec, root: Node, filePath: string, content: string): SimpleFileInfo {
  const imports = collectImports(spec, root);
  const types = new Map<string, TypeAccumulator>();
  const functions: SimpleFunctionInfo[] = [];
  const externalMethods: Array<{ owner: string; name: string; node: Node }> = [];

  const typeFor = (name: string): TypeAccumulator => {
    let entry = types.get(name);
    if (!entry) {
      entry = { name, lineCount: 0, methods: new Set(), propertyCount: 0 };
      types.set(name, entry);
    }
    return entry;
  };

  /** Methods and fields of one type body; nested types are visited as types of their own. */
  const readBody = (owner: TypeAccumulator, body: Node): void => {
    walk(body, (node) => {
      if (node === body) return true;
      if (spec.typeDeclaration(node)) {
        visit(node);
        return false;
      }
      const name = spec.functionName(node);
      if (name) {
        owner.methods.add(name);
        visitNestedTypes(node);
        return false;
      }
      if (spec.isField(node)) {
        owner.propertyCount += spec.fieldCount?.(node) ?? 1;
        return false;
      }
      return true;
    });
    owner.propertyCount += spec.instanceFields?.(body) ?? 0;
  };

  /** Types declared inside a function body (local classes, test fixtures) are still types. */
  const visitNestedTypes = (functionNode: Node): void => {
    walk(functionNode, (child) => {
      if (child === functionNode) return true;
      if (spec.typeDeclaration(child)) {
        visit(child);
        return false;
      }
      return true;
    });
  };

  const visit = (node: Node): void => {
    const declaration = spec.typeDeclaration(node);
    if (declaration) {
      const entry = typeFor(declaration.name);
      entry.lineCount += lineSpan(node);
      if (declaration.body) readBody(entry, declaration.body);
      return;
    }
    const container = spec.methodContainer?.(node);
    if (container) {
      readBody(typeFor(container), node);
      return;
    }
    const name = spec.functionName(node);
    if (name) {
      const owner = spec.externalMethodOwner?.(node, node);
      if (owner) externalMethods.push({ owner, name, node });
      else functions.push({ name, lineCount: lineSpan(node), paramCount: parameterCount(spec, node) });
      visitNestedTypes(node);
      return;
    }
    for (const child of namedChildren(node)) visit(child);
  };

  visit(root);
  for (const method of externalMethods) {
    if (spec.externalOwnersAreTypes || types.has(method.owner)) typeFor(method.owner).methods.add(method.name);
    else functions.push({ name: method.name, lineCount: lineSpan(method.node), paramCount: parameterCount(spec, method.node) });
  }

  const functionNames = functions.map((fn) => fn.name);
  const classes: SimpleClassInfo[] = Array.from(types.values(), (type) => {
    const methods = Array.from(type.methods);
    return {
      name: type.name,
      filePath,
      lineCount: type.lineCount,
      methodCount: methods.length,
      propertyCount: type.propertyCount,
      importCount: imports.length,
      constructorExists: spec.hasConstructor(type.name, methods, functionNames),
      methods,
      dependencies: imports,
    };
  });

  return { filePath, classes, functions, imports, lineCount: countLines(content), dependencies: imports };
}
