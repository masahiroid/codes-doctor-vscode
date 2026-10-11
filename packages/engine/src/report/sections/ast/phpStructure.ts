import { parsePhpAst } from './parsers';
import { OutlineType, renderOutline } from './structureOutline';

/** AST keys that carry no structure and would only slow the walk down. */
const SKIPPED_KEYS = new Set(['loc', 'leadingComments', 'trailingComments']);

interface PhpClassOutline {
  name: string;
  methods: string[];
  properties: number;
}

/** Namespaces, `use` imports, classes (properties + methods) and functions of a PHP file. */
export function buildPhpStructure(content: string, filePath: string): string {
  const namespaces = new Set<string>();
  const uses: string[] = [];
  const classes: PhpClassOutline[] = [];
  const functions: string[] = [];
  let currentClass: PhpClassOutline | null = null;

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (node.kind === 'namespace') {
      const name = qualifiedName(node.name);
      if (name) namespaces.add(name);
    }
    if (node.kind === 'useitem' && node.name) {
      const name = qualifiedName(node.name);
      if (name) uses.push(name);
    }
    if (node.kind === 'class') {
      currentClass = { name: String(declaredName(node) || 'Anonymous'), methods: [], properties: 0 };
      classes.push(currentClass);
    }
    if (node.kind === 'method' && currentClass) {
      const name = declaredName(node);
      if (name) currentClass.methods.push(String(name));
    }
    if (node.kind === 'property' && currentClass) {
      currentClass.properties += Array.isArray(node.properties) ? node.properties.length : 1;
    }
    if (node.kind === 'function') {
      const name = declaredName(node);
      if (name) functions.push(String(name));
    }

    for (const key of Object.keys(node)) {
      if (!SKIPPED_KEYS.has(key)) walk(node[key]);
    }
    if (node.kind === 'class') currentClass = null;
  };

  walk(parsePhpAst(content, filePath));

  const types: OutlineType[] = classes.map((cls) => ({
    name: cls.name,
    counts: [{ label: 'プロパティ', value: cls.properties }],
    methods: cls.methods,
  }));
  return renderOutline([
    { kind: 'names', heading: '名前空間', items: Array.from(namespaces) },
    { kind: 'names', heading: '使用宣言', items: uses },
    { kind: 'types', heading: 'クラス', types },
    { kind: 'names', heading: '関数', items: functions, suffix: '()' },
  ]);
}

function declaredName(node: any): unknown {
  return node.name?.name || node.name;
}

function qualifiedName(name: any): string | undefined {
  if (name?.name) return String(name.name);
  if (name?.parts) return name.parts.join('\\');
  return undefined;
}
