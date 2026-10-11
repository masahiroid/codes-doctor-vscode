import { FileInfo, PHPFileInfo } from '../../types';

export interface D3GraphNode {
  id: string;
  name: string;
  group: string; // Layer or category
  size: number; // Based on complexity
  filePath: string;
}

export interface D3GraphLink {
  source: string;
  target: string;
  value: number; // Strength of dependency
}

export interface D3Graph {
  nodes: D3GraphNode[];
  links: D3GraphLink[];
}

/** Directory-name patterns used to group nodes by architectural layer in the graph */
const GROUP_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /\/(components?|ui|views?)\//i, name: 'Presentation' },
  { pattern: /\/(services?|business|domain)\//i, name: 'Business' },
  { pattern: /\/(repositories?|dao|data)\//i, name: 'Data' },
  { pattern: /\/(models?|entities?|types?)\//i, name: 'Models' },
  { pattern: /\/(utils?|helpers?|common)\//i, name: 'Utils' },
  { pattern: /\/(api|controllers?|routes?)\//i, name: 'API' },
];

export const D3_GRAPH_GROUPS = ['Presentation', 'Business', 'Data', 'Models', 'Utils', 'API', 'Other'];

/** Weight of method count in the node-size (complexity proxy) formula */
const NODE_SIZE_METHOD_WEIGHT = 2;
/** Divisor applied to line count in the node-size formula */
const NODE_SIZE_LINE_DIVISOR = 10;

/** Caps rendered graph size for performance */
const MAX_RENDERED_NODES = 100;
const MAX_RENDERED_LINKS = 200;

interface ClassLike {
  name: string;
  methodCount: number;
  lineCount: number;
  dependencies: string[];
}

/**
 * Build D3.js-compatible graph data from class dependencies.
 */
export function buildD3DependencyGraph(tsFiles: FileInfo[], phpFiles: PHPFileInfo[]): D3Graph {
  const nodeMap = new Map<string, D3GraphNode>();
  const linkMap = new Map<string, number>();

  for (const fileInfo of tsFiles) {
    addFileToGraph(fileInfo.filePath, fileInfo.classes, tsFiles, phpFiles, nodeMap, linkMap);
  }
  for (const fileInfo of phpFiles) {
    addFileToGraph(fileInfo.filePath, fileInfo.classes, tsFiles, phpFiles, nodeMap, linkMap);
  }

  const links: D3GraphLink[] = Array.from(linkMap.entries()).map(([linkKey, value]) => {
    const [source, target] = linkKey.split('->');
    return { source, target, value };
  });

  const topNodes = Array.from(nodeMap.values())
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_RENDERED_NODES);

  const topNodeIds = new Set(topNodes.map((n) => n.id));

  const topLinks = links
    .filter((l) => topNodeIds.has(l.source) && topNodeIds.has(l.target))
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_RENDERED_LINKS);

  return { nodes: topNodes, links: topLinks };
}

function addFileToGraph(
  filePath: string,
  classes: ClassLike[],
  tsFiles: FileInfo[],
  phpFiles: PHPFileInfo[],
  nodeMap: Map<string, D3GraphNode>,
  linkMap: Map<string, number>
): void {
  for (const classInfo of classes) {
    const nodeId = `${filePath}:${classInfo.name}`;

    if (!nodeMap.has(nodeId)) {
      nodeMap.set(nodeId, {
        id: nodeId,
        name: classInfo.name,
        group: detectGroup(filePath),
        size: calculateNodeSize(classInfo),
        filePath,
      });
    }

    for (const dep of classInfo.dependencies) {
      const targetNodeId = findTargetNode(dep, tsFiles, phpFiles);
      if (targetNodeId && targetNodeId !== nodeId) {
        const linkKey = `${nodeId}->${targetNodeId}`;
        linkMap.set(linkKey, (linkMap.get(linkKey) || 0) + 1);
      }
    }
  }
}

function detectGroup(filePath: string): string {
  for (const { pattern, name } of GROUP_PATTERNS) {
    if (pattern.test(filePath)) {
      return name;
    }
  }

  const parts = filePath.split('/');
  if (parts.length > 1) {
    return parts[0];
  }

  return 'Other';
}

function calculateNodeSize(classInfo: ClassLike): number {
  return classInfo.methodCount * NODE_SIZE_METHOD_WEIGHT + classInfo.lineCount / NODE_SIZE_LINE_DIVISOR;
}

function findTargetNode(dep: string, tsFiles: FileInfo[], phpFiles: PHPFileInfo[]): string | null {
  const parts = dep.split('/');
  const lastPart = parts[parts.length - 1];
  const className = lastPart.replace(/\.(ts|js|tsx|jsx|php)$/, '');

  for (const fileInfo of [...tsFiles, ...phpFiles]) {
    for (const classInfo of fileInfo.classes) {
      if (classInfo.name === className || fileInfo.filePath.includes(dep)) {
        return `${fileInfo.filePath}:${classInfo.name}`;
      }
    }
  }

  return null;
}
