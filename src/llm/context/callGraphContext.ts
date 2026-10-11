import { CallGraph } from '../../types';
import { P90, percentile } from './percentile';

const TOP_N_LIST_SIZE = 10;

export interface CallGraphContext {
  edgeCount: number;
  nodeCount: number;
  outDegreeP90: number;
  inDegreeP90: number;
  topCallers: Array<{ node: string; outDegree: number }>;
  topCallees: Array<{ node: string; inDegree: number }>;
}

export function buildCallGraphContext(callGraph: CallGraph | undefined): CallGraphContext {
  const callerMap = new Map<string, number>();
  const calleeMap = new Map<string, number>();
  for (const edge of callGraph?.edges || []) {
    callerMap.set(edge.from, (callerMap.get(edge.from) || 0) + 1);
    calleeMap.set(edge.to, (calleeMap.get(edge.to) || 0) + 1);
  }

  const topCallers = Array.from(callerMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_LIST_SIZE)
    .map(([node, outDegree]) => ({ node, outDegree }));

  const topCallees = Array.from(calleeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_LIST_SIZE)
    .map(([node, inDegree]) => ({ node, inDegree }));

  return {
    edgeCount: callGraph?.edges?.length || 0,
    nodeCount: callGraph?.nodes?.length || 0,
    outDegreeP90: percentile(Array.from(callerMap.values()), P90),
    inDegreeP90: percentile(Array.from(calleeMap.values()), P90),
    topCallers,
    topCallees,
  };
}
