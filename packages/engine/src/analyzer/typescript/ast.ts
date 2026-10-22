import { parse } from '@typescript-eslint/typescript-estree';
import { ClassInfo, FileInfo, FunctionInfo } from '../../types';
import { readFileContent } from '../../fileWalker';
import { collectStaticImports } from '../dependencies/staticImports';
import path from 'path';
import fs from 'fs';

/**
 * Count lines in a string
 */
/**
 * JSX only where the file type allows it. In a `.ts` file `<T>(x) => x` is a generic arrow
 * function, and parsing it as JSX fails the whole file.
 */
export function allowsJsx(filePath: string): boolean {
  return !/\.[cm]?ts$/i.test(filePath);
}

function countLines(content: string): number {
  return content.split('\n').length;
}

/**
 * Parse a single TypeScript/JavaScript file and extract structural information.
 */
export async function parseFile(filePath: string): Promise<FileInfo> {
  const fileContent = await readFileContent(filePath);
  if (!fileContent) {
    console.warn(`   [WARNING] Empty file: ${path.basename(filePath)}`);
    return {
      filePath,
      classes: [],
      functions: [],
      imports: [],
      lineCount: 0,
    };
  }

  const lineCount = countLines(fileContent);
  const classes: ClassInfo[] = [];
  const functions: FunctionInfo[] = [];
  const imports: string[] = [];

  try {
    const ast = parse(fileContent, {
      jsx: allowsJsx(filePath),
      loc: true,
      range: true,
      ecmaVersion: 'latest',
      sourceType: 'module',
    });

    imports.push(...collectStaticImports(ast));

    // Extract classes
    if (ast.body) {
      for (const entry of ast.body) {
        // Exported classes are measured like any other class.
        const node = entry.type === 'ExportNamedDeclaration' || entry.type === 'ExportDefaultDeclaration' ? entry.declaration : entry;
        if (!node) continue;
        if (node.type === 'ClassDeclaration' && node.id) {
          const className = (node.id as any).name;
          const methods: string[] = [];
          const classImports: string[] = [];
          let methodCount = 0;
          let propertyCount = 0;
          let constructorExists = false;

          if ((node as any).body && (node as any).body.body) {
            for (const member of (node as any).body.body) {
              if (member.type === 'MethodDefinition') {
                const methodName = (member.key as any).name || (member.key as any).value;
                if (methodName) {
                  methods.push(methodName);
                  if (methodName === 'constructor') {
                    constructorExists = true;
                  }
                  methodCount++;
                }
              } else if (member.type === 'PropertyDefinition') {
                propertyCount++;
              }
            }
          }

          // Simple heuristic: count imports for the file (all imports apply to all classes in the file)
          const importCount = imports.length;

          const classLineCount = node.loc ? node.loc.end.line - node.loc.start.line + 1 : 0;

          const classInfo: ClassInfo = {
            name: className,
            filePath,
            lineCount: classLineCount,
            methodCount,
            propertyCount,
            importCount,
            constructorExists,
            methods,
            dependencies: Array.from(new Set(imports)),
          };

          console.log(`   [CLASS FOUND] ${className} in ${path.basename(filePath)} (${classLineCount} lines, ${methodCount} methods)`);
          classes.push(classInfo);
        } else if (node.type === 'FunctionDeclaration' && node.id) {
          const functionName = (node.id as any).name;
          if (functionName) {
            const functionInfo: FunctionInfo = {
              name: functionName,
              lineCount: node.loc ? node.loc.end.line - node.loc.start.line : 0,
              paramCount: (node as any).params ? (node as any).params.length : 0,
            };
            functions.push(functionInfo);
          }
        }
      }
    }

    const result = {
      filePath,
      classes,
      functions,
      imports: Array.from(new Set(imports)),
      lineCount,
    };

    if (classes.length > 0 || functions.length > 0) {
      console.log(`   [OK] ${path.basename(filePath)}: ${classes.length} classes, ${functions.length} functions`);
    } else {
      console.log(`   [DEBUG] No classes or functions found in ${path.basename(filePath)}`);
      console.log(`   [DEBUG] AST root node type: ${ast.type}, Body length: ${ast.body?.length || 0}`);
    }

    return result;
  } catch (error) {
    console.warn(`   [ERROR] Failed to parse ${path.basename(filePath)}:`, (error as Error).message);
    return {
      filePath,
      classes: [],
      functions: [],
      imports: [],
      lineCount,
    };
  }
}

/**
 * Analyze all files in a directory.
 */
export async function analyzeDirectory(dirPath: string, files: string[]): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  for (const file of files) {
    try {
      const info = await parseFile(file);
      results.push(info);
    } catch (error) {
      console.warn(`Warning: Failed to analyze file ${file}:`, error);
      // Skip failed files silently
    }
  }

  return results;
}
