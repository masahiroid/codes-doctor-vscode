import { FileInfo, CallEdge, CallGraph } from '../../types';
import { parse } from '@typescript-eslint/typescript-estree';
import { readFileContent } from '../../fileWalker';

/**
 * Build a call graph from TypeScript/JavaScript source files.
 */
export async function buildCallGraph(fileInfoList: FileInfo[]): Promise<CallGraph> {
  const edges: CallEdge[] = [];
  const nodeSet = new Set<string>();

  // For each file and class, extract method calls
  for (const fileInfo of fileInfoList) {
    const fileContent = await readFileContent(fileInfo.filePath);
    if (!fileContent) {
      continue;
    }

    try {
      const ast = parse(fileContent, {
        jsx: true,
        loc: true,
        range: true,
        ecmaVersion: 'latest',
        sourceType: 'module',
      });

      // Find all CallExpressions in the AST
      if (ast.body) {
        for (const node of ast.body) {
          // Handle class declarations
          if (node.type === 'ClassDeclaration' && node.id) {
            const className = (node.id as any).name;
            if ((node as any).body && (node as any).body.body) {
              for (const member of (node as any).body.body) {
                if (member.type === 'MethodDefinition') {
                  const methodName = (member.key as any).name || (member.key as any).value;
                  if (methodName && (member as any).value) {
                    // Extract calls from method body
                    const methodKey = `${className}.${methodName}`;
                    nodeSet.add(methodKey);
                    extractCalls(
                      (member as any).value,
                      methodKey,
                      edges,
                      nodeSet,
                      fileInfo.filePath
                    );
                  }
                }
              }
            }
          }

          // Handle function declarations
          if (node.type === 'FunctionDeclaration' && node.id) {
            const functionName = (node.id as any).name;
            nodeSet.add(functionName);
            extractCalls(node, functionName, edges, nodeSet, fileInfo.filePath);
          }
        }
      }
    } catch (error) {
      console.warn(`Warning: Failed to build call graph for ${fileInfo.filePath}:`, error);
    }
  }

  // Deduplicate edges
  const uniqueEdges = Array.from(new Map(edges.map((e) => [
    `${e.from}|${e.to}|${e.filePath}`,
    e,
  ])).values());

  // Get unique node names
  const nodes = Array.from(nodeSet);

  return {
    edges: uniqueEdges,
    nodes,
  };
}

/**
 * Extract function/method calls from an AST node.
 */
function extractCalls(
  node: any,
  fromName: string,
  edges: CallEdge[],
  nodeSet: Set<string>,
  filePath: string
): void {
  if (!node) {
    return;
  }

  // Recursively walk the AST
  if (typeof node === 'object' && !Array.isArray(node)) {
    // Check if this is a CallExpression
    if (node.type === 'CallExpression') {
      let calleeName: string | null = null;

      // Handle simple identifier: foo()
      if (node.callee.type === 'Identifier') {
        calleeName = node.callee.name;
      }
      // Handle member expression: obj.method()
      else if (node.callee.type === 'MemberExpression' && node.callee.property) {
        if (node.callee.property.type === 'Identifier') {
          calleeName = node.callee.property.name;
        } else if (node.callee.property.type === 'Literal') {
          calleeName = String(node.callee.property.value);
        }
      }

      if (calleeName) {
        nodeSet.add(calleeName);
        edges.push({
          from: fromName,
          to: calleeName,
          filePath,
        });
      }
    }

    // Recursively extract from all properties
    for (const key in node) {
      if (node.hasOwnProperty(key) && key !== 'loc' && key !== 'range') {
        extractCalls(node[key], fromName, edges, nodeSet, filePath);
      }
    }
  } else if (Array.isArray(node)) {
    for (const item of node) {
      extractCalls(item, fromName, edges, nodeSet, filePath);
    }
  }
}

/**
 * Convert call graph to Mermaid flowchart format.
 */
export function toMermaidCallGraph(callGraph: CallGraph): string {
  if (callGraph.edges.length === 0) {
    return 'graph LR\n  note["No function calls detected"]';
  }

  // Limit to top 50 edges (most connected nodes first)
  const sortedEdges = callGraph.edges
    .slice(0, 50)
    .map((e) => `  ${toMermaidNode(e.from)} -->|calls| ${toMermaidNode(e.to)}`);

  return `graph LR\n${sortedEdges.join('\n')}`;
}

/**
 * Build a Mermaid node with a safe id and a readable label.
 */
function toMermaidNode(name: string): string {
  const id = toMermaidId(name);
  const label = escapeMermaidLabel(name);
  return `${id}["${label}"]`;
}

/**
 * Generate a safe Mermaid node id.
 */
function toMermaidId(name: string): string {
  const base = name.replace(/\./g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  const safe = base.length > 0 ? base : hashString(name);
  return `n_${safe}`;
}

/**
 * Escape label text for Mermaid.
 */
function escapeMermaidLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[^\w\s\-_]/g, ' ')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Simple deterministic hash for fallback ids.
 */
function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
