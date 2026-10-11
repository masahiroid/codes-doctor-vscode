import { PHPFileInfo, CallEdge, CallGraph } from '../../types';
import { getIdentifierName, parsePhpFile, traversePhpAst } from './phpAst';

/**
 * Build a call graph from PHP source files.
 * Enhanced to support:
 * - Static calls: Class::method()
 * - Instance calls: $obj->method()
 * - Function calls: function()
 * - Dynamic calls: call_user_func(), call_user_func_array()
 * - Variable method calls: $obj->$method()
 */
export async function buildPHPCallGraph(fileInfoList: PHPFileInfo[]): Promise<CallGraph> {
  const edges: CallEdge[] = [];
  const nodeSet = new Set<string>();

  // Build maps of all available methods and functions
  const classMethodMap = new Map<string, Set<string>>();
  const functionSet = new Set<string>();
  
  for (const fileInfo of fileInfoList) {
    for (const classInfo of fileInfo.classes) {
      nodeSet.add(classInfo.name);
      const methods = new Set(classInfo.methods);
      classMethodMap.set(classInfo.name, methods);
      for (const method of classInfo.methods) {
        const fullName = `${classInfo.name}.${method}`;
        nodeSet.add(fullName);
      }
    }

    for (const func of fileInfo.functions) {
      functionSet.add(func.name);
      nodeSet.add(func.name);
    }
  }

  // Process files to detect calls within method/function scopes
  for (const fileInfo of fileInfoList) {
    const parsed = await parsePhpFile(fileInfo.filePath);
    if (!parsed) continue;

    const { ast } = parsed;
    let currentClass: string | null = null;
    const scopeStack: string[] = [];
    
    // Simple variable tracking for dynamic calls
    // Maps variable names to possible function names
    const variableValues = new Map<string, Set<string>>();

    const addMethodEdges = (methodName: string, fromName: string) => {
      for (const [className, methods] of classMethodMap.entries()) {
        if (methods.has(methodName)) {
          const targetKey = `${className}.${methodName}`;
          if (targetKey !== fromName) {
            edges.push({
              from: fromName,
              to: targetKey,
              filePath: fileInfo.filePath,
            });
          }
        }
      }
    };

    traversePhpAst(
      ast,
      (node) => {
        if (node.kind === 'class') {
          const className = getIdentifierName(node.name);
          if (className) currentClass = className;
        }

        if (node.kind === 'method' && currentClass) {
          const methodName = getIdentifierName(node.name);
          if (!methodName) return;
          const methodKey = `${currentClass}.${methodName}`;
          scopeStack.push(methodKey);
          nodeSet.add(methodKey);
          variableValues.clear(); // Reset variable tracking per scope
        }

        if (node.kind === 'function' && !currentClass) {
          const functionName = getIdentifierName(node.name);
          if (!functionName) return;
          scopeStack.push(functionName);
          nodeSet.add(functionName);
          variableValues.clear(); // Reset variable tracking per scope
        }

        // Track simple assignments for dynamic call detection
        // e.g., $callback = 'functionName';
        if (node.kind === 'assign' && scopeStack.length > 0) {
          const varName = getIdentifierName(node.left);
          const value = getIdentifierName(node.right);
          if (varName && value && functionSet.has(value)) {
            if (!variableValues.has(varName)) {
              variableValues.set(varName, new Set());
            }
            variableValues.get(varName)!.add(value);
          }
        }

        // Handle regular function calls
        if (node.kind === 'call' && scopeStack.length > 0) {
          const fromName = scopeStack.at(-1)!;
          const targetName = getIdentifierName(node.what);

          // Direct function call: function()
          if (targetName && functionSet.has(targetName) && !isPhpBuiltIn(targetName)) {
            edges.push({
              from: fromName,
              to: targetName,
              filePath: fileInfo.filePath,
            });
          }
          // Dynamic function call via variable: $callback()
          else if (node.what?.kind === 'variable') {
            const varName = getIdentifierName(node.what);
            if (varName && variableValues.has(varName)) {
              for (const funcName of variableValues.get(varName)!) {
                edges.push({
                  from: fromName,
                  to: funcName,
                  filePath: fileInfo.filePath,
                });
              }
            }
          }
          // call_user_func($callback) or call_user_func('functionName')
          else if (targetName === 'call_user_func' || targetName === 'call_user_func_array') {
            const firstArg = node.arguments?.[0];
            if (firstArg) {
              const argName = getIdentifierName(firstArg);
              if (argName && functionSet.has(argName) && !isPhpBuiltIn(argName)) {
                edges.push({
                  from: fromName,
                  to: argName,
                  filePath: fileInfo.filePath,
                });
              } else if (firstArg.kind === 'variable' && variableValues.has(getIdentifierName(firstArg)!)) {
                // call_user_func($var) where $var = 'functionName'
                for (const funcName of variableValues.get(getIdentifierName(firstArg)!)!) {
                  edges.push({
                    from: fromName,
                    to: funcName,
                    filePath: fileInfo.filePath,
                  });
                }
              }
            }
          }
          // Instance method call: $obj->method()
          else if (node.what?.kind === 'propertylookup' || node.what?.kind === 'nullsafepropertylookup') {
            const methodName = getIdentifierName(node.what.offset);
            if (methodName) {
              addMethodEdges(methodName, fromName);
            }
          }
          // Static method call: Class::method()
          else if (node.what?.kind === 'staticlookup') {
            const className = getIdentifierName(node.what.what);
            const methodName = getIdentifierName(node.what.offset);
            if (className && methodName) {
              const methods = classMethodMap.get(className);
              if (methods && methods.has(methodName)) {
                const targetKey = `${className}.${methodName}`;
                if (targetKey !== fromName) {
                  edges.push({
                    from: fromName,
                    to: targetKey,
                    filePath: fileInfo.filePath,
                  });
                }
              }
            } else if (methodName) {
              addMethodEdges(methodName, fromName);
            }
          }
        }

        if (node.kind === 'methodcall' && scopeStack.length > 0) {
          const fromName = scopeStack.at(-1)!;
          const methodName = getIdentifierName(node.offset);
          if (methodName) {
            addMethodEdges(methodName, fromName);
          }
        }

        if (node.kind === 'staticcall' && scopeStack.length > 0) {
          const fromName = scopeStack.at(-1)!;
          const className = getIdentifierName(node.class);
          const methodName = getIdentifierName(node.offset);
          if (className && methodName) {
            const methods = classMethodMap.get(className);
            if (methods && methods.has(methodName)) {
              const targetKey = `${className}.${methodName}`;
              if (targetKey !== fromName) {
                edges.push({
                  from: fromName,
                  to: targetKey,
                  filePath: fileInfo.filePath,
                });
              }
            }
          }
        }
      },
      (node) => {
        if (node.kind === 'method' || (node.kind === 'function' && !currentClass)) {
          scopeStack.pop();
          variableValues.clear();
        }
        if (node.kind === 'class') {
          currentClass = null;
        }
      }
    );
  }

  // Remove duplicate edges
  const uniqueEdges = Array.from(
    new Map(edges.map(edge => [`${edge.from}->${edge.to}`, edge])).values()
  );

  return {
    edges: uniqueEdges,
    nodes: Array.from(nodeSet),
  };
}

/**
 * Check if a name is a PHP built-in function
 */
function isPhpBuiltIn(name: string): boolean {
  const builtIns = new Set([
    'echo', 'print', 'var_dump', 'print_r', 'die', 'exit', 'isset', 'empty',
    'unset', 'array', 'list', 'eval', 'include', 'require', 'include_once',
    'require_once', 'define', 'defined', 'is_array', 'is_string', 'is_numeric',
    'is_null', 'is_bool', 'is_object', 'count', 'sizeof', 'strlen', 'str_replace',
    'str_contains', 'substr', 'explode', 'implode', 'trim', 'ltrim', 'rtrim',
    'strtolower', 'strtoupper', 'ucfirst', 'lcfirst', 'array_push', 'array_pop',
    'array_shift', 'array_unshift', 'array_merge', 'array_values', 'array_keys',
    'foreach', 'for', 'while', 'do', 'switch', 'if', 'else', 'elseif', 'return',
    'break', 'continue', 'throw', 'try', 'catch', 'finally', 'new', 'clone',
    'instanceof', 'function', 'class', 'interface', 'trait', 'namespace', 'use',
    'as', 'global', 'static', 'const', 'var', 'public', 'private', 'protected',
    'abstract', 'final', 'extends', 'implements', 'yield', 'from',
  ]);

  return builtIns.has(name.toLowerCase());
}



/**
 * Convert PHP call graph to Mermaid diagram format
 */
export function toMermaidPHPCallGraph(callGraph: CallGraph): string {
  if (callGraph.edges.length === 0) {
    return 'graph LR\n  note["No function calls detected"]';
  }

  let mermaid = 'graph LR\n';

  // Group edges by source to manage complexity
  const edgesBySource = new Map<string, Set<string>>();
  
  for (const edge of callGraph.edges) {
    if (!edgesBySource.has(edge.from)) {
      edgesBySource.set(edge.from, new Set());
    }
    edgesBySource.get(edge.from)!.add(edge.to);
  }

  // Limit to 50 edges to keep diagram readable
  let edgeCount = 0;
  const maxEdges = 50;

  for (const [from, targets] of edgesBySource.entries()) {
    for (const to of targets) {
      if (edgeCount >= maxEdges) break;
      
      const fromLabel = from.replaceAll(/\\W/g, '_');
      const toLabel = to.replaceAll(/\\W/g, '_');
      
      mermaid += `  ${fromLabel}["${from}"] --> ${toLabel}["${to}"]\n`;
      edgeCount++;
    }
    
    if (edgeCount >= maxEdges) break;
  }

  if (callGraph.edges.length > maxEdges) {
    mermaid += `  note["Showing ${maxEdges} of ${callGraph.edges.length} calls"]\n`;
  }

  return mermaid;
}
