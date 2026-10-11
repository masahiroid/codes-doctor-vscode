import { PHPFileInfo, PHPClassInfo } from '../../types';
import { getIdentifierName, getNodeLineCount, getQualifiedName, parsePhpFile, traversePhpAst } from './phpAst';

/**
 * Analyze a single PHP file using AST-based structural analysis.
 */
export async function analyzePHPFile(filePath: string): Promise<PHPFileInfo> {
  const parsed = await parsePhpFile(filePath);
  if (!parsed) {
    return {
      filePath,
      classes: [],
      functions: [],
      lineCount: 0,
      dependencies: [],
    };
  }

  const { ast, content } = parsed;
  const lineCount = content.split('\n').length;
  const functions: { name: string; lineCount: number }[] = [];
  const uses: string[] = [];

  const classMap = new Map<
    string,
    {
      name: string;
      filePath: string;
      lineCount: number;
      methodNames: Set<string>;
      propertyCount: number;
      namespace: string | null;
    }
  >();

  let currentClass: string | null = null;
  let currentNamespace: string | null = null;

  traversePhpAst(
    ast,
    (node) => {
      if (node.kind === 'namespace') {
        currentNamespace = getQualifiedName(node.name);
      }

      if (node.kind === 'usegroup') {
        const items = Array.isArray(node.items) ? node.items : [];
        for (const item of items) {
          const useName = getQualifiedName(item.name || item);
          if (useName) uses.push(useName);
        }
      }

      if (node.kind === 'useitem') {
        const useName = getQualifiedName(node.name);
        if (useName) uses.push(useName);
      }

      if (node.kind === 'class') {
        const className = getIdentifierName(node.name);
        if (!className) return;
        currentClass = className;
        if (!classMap.has(className)) {
          classMap.set(className, {
            name: className,
            filePath,
            lineCount: getNodeLineCount(node),
            methodNames: new Set<string>(),
            propertyCount: 0,
            namespace: currentNamespace,
          });
        }
      }

      if (node.kind === 'method' && currentClass) {
        const methodName = getIdentifierName(node.name);
        if (!methodName) return;
        const classInfo = classMap.get(currentClass);
        if (classInfo) {
          classInfo.methodNames.add(methodName);
        }
      }

      if (node.kind === 'property' && currentClass) {
        const classInfo = classMap.get(currentClass);
        if (classInfo) {
          const count = Array.isArray(node.properties) ? node.properties.length : 1;
          classInfo.propertyCount += count;
        }
      }

      if (node.kind === 'function' && !currentClass) {
        const functionName = getIdentifierName(node.name);
        if (!functionName) return;
        functions.push({
          name: functionName,
          lineCount: getNodeLineCount(node),
        });
      }
    },
    (node) => {
      if (node.kind === 'class') {
        currentClass = null;
      }
      if (node.kind === 'namespace') {
        currentNamespace = null;
      }
    }
  );

  const classes: PHPClassInfo[] = Array.from(classMap.values()).map((classInfo) => ({
    name: classInfo.name,
    filePath: classInfo.filePath,
    lineCount: classInfo.lineCount,
    methodCount: classInfo.methodNames.size,
    propertyCount: classInfo.propertyCount,
    useCount: uses.length,
    methods: Array.from(classInfo.methodNames),
    namespace: classInfo.namespace,
    dependencies: uses,
  }));

  return {
    filePath,
    classes,
    functions,
    lineCount,
    dependencies: uses,
  };
}

/**
 * Analyze all PHP files in an array.
 */
export async function analyzeDirectory(files: string[]): Promise<PHPFileInfo[]> {
  const results: PHPFileInfo[] = [];

  for (const file of files) {
    try {
      const info = await analyzePHPFile(file);
      results.push(info);
    } catch (error) {
      console.warn(`Warning: Failed to analyze PHP file ${file}:`, error);
      // Skip failed files silently
    }
  }

  return results;
}
