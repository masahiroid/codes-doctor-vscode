import { FileInfo, PHPFileInfo, DartFileInfo, ModuleMetrics, CircularDependency } from '../types';
import path from 'node:path';

/** Percentile used to cap fan-in normalization, so a single outlier module doesn't
 * collapse every other module's fanInScore close to zero. */
const FAN_IN_NORMALIZATION_PERCENTILE = 0.9;

/** Weight of each component in the 0-100 structural score (must sum to 1.0) */
const STRUCTURAL_SCORE_WEIGHTS = {
  stability: 0.25,
  centrality: 0.25,
  fanIn: 0.2,
  size: 0.3,
} as const;

/** Degree Centrality and Betweenness Centrality are weighted equally */
const CENTRALITY_COMPONENT_WEIGHT = 0.5;

/** Line-count buckets and their size-score contribution (smaller is better) */
const SIZE_SCORE_BUCKETS: Array<{ maxLines: number; score: number }> = [
  { maxLines: 80, score: 1 },
  { maxLines: 160, score: 0.9 },
  { maxLines: 260, score: 0.75 },
  { maxLines: 400, score: 0.6 },
  { maxLines: 600, score: 0.45 },
];
const SIZE_SCORE_OVERSIZED = 0.3;
const SIZE_SCORE_EMPTY = 0.5;

/**
 * Build adjacency graph from dependencies
 */
function buildGraph(files: (FileInfo | PHPFileInfo | DartFileInfo)[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  const getModuleName = (filePath: string): string => {
    return path.basename(filePath, path.extname(filePath));
  };
  
  // Initialize graph
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    if (!graph.has(moduleName)) {
      graph.set(moduleName, new Set());
    }
  }
  
  // Build edges (bidirectional for centrality calculation)
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    let imports: string[] = [];
    
    if ('imports' in file) {
      imports = file.imports;
    } else {
      imports = file.classes.flatMap(c => c.dependencies || []);
    }
    
    for (const importPath of imports) {
      const importedModule = path.basename(importPath, path.extname(importPath));
      if (graph.has(importedModule) && importedModule !== moduleName) {
        graph.get(moduleName)?.add(importedModule);
        graph.get(importedModule)?.add(moduleName); // Bidirectional
      }
    }
  }
  
  return graph;
}

/**
 * Calculate Betweenness Centrality using Brandes' algorithm
 * BC(v) = sum of (sigma_st(v) / sigma_st) for all pairs s,t
 * where sigma_st = number of shortest paths from s to t
 * and sigma_st(v) = number of shortest paths from s to t passing through v
 */
function calculateBetweennessCentrality(
  graph: Map<string, Set<string>>
): Map<string, number> {
  const nodeList = Array.from(graph.keys());
  const nodeCount = nodeList.length;
  const betweenness = new Map<string, number>();
  
  // Initialize betweenness scores
  for (const node of nodeList) {
    betweenness.set(node, 0);
  }
  
  // For each source node
  for (const source of nodeList) {
    // BFS to find shortest paths
    const dist = new Map<string, number>();
    const pred = new Map<string, Set<string>>();
    const sigma = new Map<string, number>();
    
    for (const node of nodeList) {
      dist.set(node, Infinity);
      pred.set(node, new Set());
      sigma.set(node, 0);
    }
    
    dist.set(source, 0);
    sigma.set(source, 1);
    
    const queue = [source];
    const order: string[] = [];
    
    // BFS
    while (queue.length > 0) {
      const v = queue.shift()!;
      order.push(v);
      
      const neighbors = graph.get(v) || new Set();
      for (const w of neighbors) {
        const newDist = (dist.get(v) || Infinity) + 1;
        const wDist = dist.get(w) || Infinity;
        
        if (newDist < wDist) {
          dist.set(w, newDist);
          sigma.set(w, 0);
          queue.push(w);
        }
        
        if (newDist === wDist) {
          sigma.set(w, (sigma.get(w) || 0) + (sigma.get(v) || 0));
          pred.get(w)?.add(v);
        }
      }
    }
    
    // Accumulation phase (reverse order)
    const delta = new Map<string, number>();
    for (const node of nodeList) {
      delta.set(node, 0);
    }
    
    // Process in reverse order
    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i];
      const predecessors = pred.get(w) || new Set();
      
      for (const v of predecessors) {
        const contribution =
          ((sigma.get(v) || 0) / (sigma.get(w) || 1)) * (1 + (delta.get(w) || 0));
        delta.set(v, (delta.get(v) || 0) + contribution);
      }
      
      if (w !== source) {
        betweenness.set(w, (betweenness.get(w) || 0) + (delta.get(w) || 0));
      }
    }
  }
  
  // Normalize betweenness centrality
  const maxBC = Math.max(...Array.from(betweenness.values()), 0);
  const normalized = new Map<string, number>();
  
  for (const [node, bc] of betweenness.entries()) {
    normalized.set(node, maxBC > 0 ? bc / maxBC : 0);
  }
  
  return normalized;
}

/**
 * Calculate fan-in, fan-out, and instability metrics for each module
 */
export function calculateModuleMetrics(
  files: (FileInfo | PHPFileInfo | DartFileInfo)[]
): ModuleMetrics[] {
  const metrics: ModuleMetrics[] = [];
  
  // Build dependency map: module -> list of modules it imports
  const dependencyMap = new Map<string, Set<string>>();
  const reverseDependencyMap = new Map<string, Set<string>>();
  
  // Normalize file paths to module names
  const getModuleName = (filePath: string): string => {
    return path.basename(filePath, path.extname(filePath));
  };
  
  // Initialize maps
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    dependencyMap.set(moduleName, new Set());
    reverseDependencyMap.set(moduleName, new Set());
  }
  
  // Build dependency relationships
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    let imports: string[] = [];
    
    if ('imports' in file) {
      // TypeScript/JavaScript file
      imports = file.imports;
    } else {
      // PHP file - collect dependencies from classes
      imports = file.classes.flatMap(c => c.dependencies || []);
    }
    
    for (const importPath of imports) {
      // Extract module name from import path
      // Handle relative imports like './config', '../utils/helper'
      const importedModule = path.basename(importPath, path.extname(importPath));
      
      // Only count if the imported module exists in our files
      if (reverseDependencyMap.has(importedModule) && importedModule !== moduleName) {
        dependencyMap.get(moduleName)?.add(importedModule);
        reverseDependencyMap.get(importedModule)?.add(moduleName);
      }
    }
  }
  
  // Calculate base metrics for each module
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    const fanOut = dependencyMap.get(moduleName)?.size || 0;
    const fanIn = reverseDependencyMap.get(moduleName)?.size || 0;
    const total = fanIn + fanOut;
    const instability = total === 0 ? 0 : fanOut / total;
    
    metrics.push({
      moduleName,
      filePath: file.filePath,
      lineCount: file.lineCount || 0,
      fanIn,
      fanOut,
      instability: Math.round(instability * 100) / 100,
      centrality: 0,
      structuralScore: 0,
    });
  }

  const moduleCount = metrics.length;

  // Use P90 of fanIn values as the normalization cap.
  // Normalizing to the global maximum causes one outlier (e.g. types.ts with 35 fan-ins)
  // to make every other module's fanInScore near-zero, unfairly collapsing the average.
  const sortedFanIns = [...metrics.map((m) => m.fanIn)].sort((a, b) => a - b);
  const p90Index = Math.floor(sortedFanIns.length * FAN_IN_NORMALIZATION_PERCENTILE);
  const fanInP90 = Math.max(1, sortedFanIns[p90Index] ?? 1);

  // Build graph and calculate Betweenness Centrality
  const graph = buildGraph(files);
  const betweennessCentrality = calculateBetweennessCentrality(graph);

  // Calculate centrality and structural score (combined with betweenness)
  for (const metric of metrics) {
    const degree = metric.fanIn + metric.fanOut;
    const degreeCentrality = moduleCount <= 1 ? 0 : degree / (moduleCount - 1);
    
    // Combine Degree Centrality and Betweenness Centrality
    // Betweenness shows bottleneck role, Degree shows direct connections
    const betweennessScore = betweennessCentrality.get(metric.moduleName) || 0;
    const combinedCentrality =
      CENTRALITY_COMPONENT_WEIGHT * degreeCentrality + CENTRALITY_COMPONENT_WEIGHT * betweennessScore;

    const stabilityScore = 1 - metric.instability;
    // Cap fanInScore at P90 so a single high-fanIn outlier (e.g. types.ts) does not
    // collapse all other modules' scores close to zero.
    const fanInScore = Math.min(metric.fanIn / fanInP90, 1.0);
    const sizeScore = calculateSizeScore(metric.lineCount);
    const structuralScore = 100 * (
      STRUCTURAL_SCORE_WEIGHTS.stability * stabilityScore +
      STRUCTURAL_SCORE_WEIGHTS.centrality * combinedCentrality +
      STRUCTURAL_SCORE_WEIGHTS.fanIn * fanInScore +
      STRUCTURAL_SCORE_WEIGHTS.size * sizeScore
    );

    metric.centrality = Math.round(combinedCentrality * 100) / 100;
    metric.structuralScore = Math.round(structuralScore * 10) / 10;
  }
  
  // Sort by instability (descending)
  return metrics.sort((a, b) => b.instability - a.instability);
}

function calculateSizeScore(lineCount: number): number {
  if (lineCount <= 0) return SIZE_SCORE_EMPTY;
  for (const bucket of SIZE_SCORE_BUCKETS) {
    if (lineCount <= bucket.maxLines) return bucket.score;
  }
  return SIZE_SCORE_OVERSIZED;
}

/**
 * Detect circular dependencies using DFS
 */
export function detectCircularDependencies(
  files: (FileInfo | PHPFileInfo | DartFileInfo)[]
): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  
  // Build adjacency list
  const graph = new Map<string, Set<string>>();
  
  const getModuleName = (filePath: string): string => {
    return path.basename(filePath, path.extname(filePath));
  };
  
  // Initialize graph
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    graph.set(moduleName, new Set());
  }
  
  // Build edges
  for (const file of files) {
    const moduleName = getModuleName(file.filePath);
    let imports: string[] = [];
    
    if ('imports' in file) {
      // TypeScript/JavaScript file
      imports = file.imports;
    } else {
      // PHP file - collect dependencies from classes
      imports = file.classes.flatMap(c => c.dependencies || []);
    }
    
    for (const importPath of imports) {
      const importedModule = path.basename(importPath, path.extname(importPath));
      
      if (graph.has(importedModule) && importedModule !== moduleName) {
        graph.get(moduleName)?.add(importedModule);
      }
    }
  }
  
  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];
  
  function dfs(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);
    
    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStartIndex = currentPath.indexOf(neighbor);
        const cycle = currentPath.slice(cycleStartIndex);
        cycle.push(neighbor); // Complete the cycle
        
        // Check if this cycle is already detected (avoid duplicates)
        const cycleKey = [...cycle].sort().join('->');
        const isDuplicate = cycles.some(c => {
          const existingKey = [...c.cycle].sort().join('->');
          return existingKey === cycleKey;
        });
        
        if (!isDuplicate) {
          cycles.push({
            cycle,
            length: cycle.length - 1,
          });
        }
        
        return true;
      }
    }
    
    currentPath.pop();
    recursionStack.delete(node);
    return false;
  }
  
  // Run DFS from each unvisited node
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }
  
  // Sort by cycle length (descending)
  return cycles.sort((a, b) => b.length - a.length);
}
