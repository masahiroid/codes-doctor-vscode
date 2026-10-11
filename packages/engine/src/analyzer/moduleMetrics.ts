import { ParsedFile, ModuleMetrics, CircularDependency } from '../types';
import { resolveInternalImport } from './dependencies/resolveImport';
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

/** Display name of a module: its file name without extension. */
function moduleDisplayName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/**
 * Directed module graph keyed by file path: an edge A -> B means A imports B.
 * TS/JS imports are resolved like the runtime would (relative path, extension,
 * directory index); other languages' dependencies are matched by file name.
 * Only edges between analyzed files are kept.
 */
function buildModuleGraph(files: readonly ParsedFile[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of files) {
    graph.set(file.filePath, new Set());
  }
  for (const file of files) {
    const imports = 'imports' in file ? file.imports : file.classes.flatMap((c) => c.dependencies || []);
    for (const importPath of imports) {
      const imported = 'imports' in file
        ? resolveInternalImport(file.filePath, importPath, files)
        : files.find((f) => moduleDisplayName(f.filePath) === moduleDisplayName(importPath))?.filePath;
      if (imported && graph.has(imported) && imported !== file.filePath) {
        graph.get(file.filePath)?.add(imported);
      }
    }
  }
  return graph;
}

/** The same graph with every edge in both directions, for centrality. */
function toUndirected(graph: Map<string, Set<string>>): Map<string, Set<string>> {
  const undirected = new Map<string, Set<string>>();
  for (const [node, targets] of graph) {
    if (!undirected.has(node)) undirected.set(node, new Set());
    for (const target of targets) {
      undirected.get(node)!.add(target);
      if (!undirected.has(target)) undirected.set(target, new Set());
      undirected.get(target)!.add(node);
    }
  }
  return undirected;
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
        const newDist = (dist.get(v) ?? Infinity) + 1;
        const wDist = dist.get(w) ?? Infinity;
        
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
  files: ParsedFile[]
): ModuleMetrics[] {
  const metrics: ModuleMetrics[] = [];
  
  const graph = buildModuleGraph(files);
  const fanInCounts = new Map<string, number>();
  for (const targets of graph.values()) {
    for (const target of targets) fanInCounts.set(target, (fanInCounts.get(target) ?? 0) + 1);
  }

  // Calculate base metrics for each module
  for (const file of files) {
    const fanOut = graph.get(file.filePath)?.size ?? 0;
    const fanIn = fanInCounts.get(file.filePath) ?? 0;
    const total = fanIn + fanOut;
    const instability = total === 0 ? 0 : fanOut / total;
    
    metrics.push({
      moduleName: moduleDisplayName(file.filePath),
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
  const betweennessCentrality = calculateBetweennessCentrality(toUndirected(graph));

  // Calculate centrality and structural score (combined with betweenness)
  for (const metric of metrics) {
    const degree = metric.fanIn + metric.fanOut;
    const degreeCentrality = moduleCount <= 1 ? 0 : degree / (moduleCount - 1);
    
    // Combine Degree Centrality and Betweenness Centrality
    // Betweenness shows bottleneck role, Degree shows direct connections
    const betweennessScore = betweennessCentrality.get(metric.filePath) || 0;
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
  files: ParsedFile[]
): CircularDependency[] {
  const cycles: CircularDependency[] = [];
  
  const graph = buildModuleGraph(files);

  // DFS to detect cycles
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const currentPath: string[] = [];
  /** Cycles already recorded, keyed by their sorted file paths so rotations count once. */
  const seenCycles = new Set<string>();

  function recordCycle(entry: string): void {
    const cycle = [...currentPath.slice(currentPath.indexOf(entry)), entry];
    const key = [...cycle].sort().join('->');
    if (seenCycles.has(key)) return;
    seenCycles.add(key);
    cycles.push({ cycle: cycle.map(moduleDisplayName), length: cycle.length - 1 });
  }

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    currentPath.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      // Keep exploring after a cycle so every cycle reachable from here is found.
      if (!visited.has(neighbor)) dfs(neighbor);
      else if (recursionStack.has(neighbor)) recordCycle(neighbor);
    }

    currentPath.pop();
    recursionStack.delete(node);
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
