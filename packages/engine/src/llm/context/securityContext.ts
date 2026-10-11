import path from 'node:path';
import type { CallGraph, SecurityIssue, SecurityScore } from '../../types';

const TRACED_FLOW_LIMIT = 15;
const OTHER_FINDING_LIMIT = 15;
const CALLER_LIMIT = 5;
const EXAMPLE_LIMIT = 3;

type Severity = SecurityIssue['type'];

/** Untrusted input traced to a dangerous call: confirmed evidence, not a pattern guess. */
export interface TracedFlowContext {
  category: string;
  severity: Severity;
  file: string;
  function?: string;
  /** Functions that call `function`, from the call graph: where the input may come from. */
  callers?: string[];
  path: Array<{ role: 'input' | 'via' | 'sink'; line: number; code: string }>;
}

/** Pattern matches the flow analysis could not connect to any input, grouped by category. */
export interface UntracedPatternContext {
  category: string;
  count: number;
  examples: string[];
}

export interface OtherFindingContext {
  category: string;
  severity: Severity;
  location: string;
}

export interface SecurityContext {
  score: number;
  grade: string;
  counts: { critical: number; high: number; medium: number; low: number };
  /** Findings in test code: listed in the report, excluded from the score and from this context. */
  testFindings: number;
  tracedFlows: TracedFlowContext[];
  untracedPatterns: UntracedPatternContext[];
  /** Findings in categories the flow analysis does not cover (secrets, crypto, deserialization, ...). */
  otherFindings: OtherFindingContext[];
  truncated: { tracedFlows: number; otherFindings: number };
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const bySeverity = (a: SecurityIssue, b: SecurityIssue) => (SEVERITY_ORDER[a.type] ?? 9) - (SEVERITY_ORDER[b.type] ?? 9);

function callersOf(callGraph: CallGraph | undefined): (name: string) => string[] {
  const callers = new Map<string, Set<string>>();
  for (const edge of callGraph?.edges ?? []) {
    if (edge.from === edge.to) continue;
    if (!callers.has(edge.to)) callers.set(edge.to, new Set());
    callers.get(edge.to)!.add(edge.from);
  }
  return (name) => [...(callers.get(name) ?? [])].sort().slice(0, CALLER_LIMIT);
}

/**
 * Security findings for the LLM, split by how much they can be trusted: traced flows
 * (input reaches the call), untraced pattern matches (leads only) and other categories.
 * Only engine-extracted lines on traced paths are included; no other source code.
 */
export function buildSecurityContext(security: SecurityScore | undefined, callGraph: CallGraph | undefined, repoPath: string): SecurityContext | undefined {
  if (!security) return undefined;
  const relative = (filePath: string) => path.relative(repoPath, filePath) || path.basename(filePath);
  const location = (issue: SecurityIssue) => relative(issue.filePath) + (issue.lineNumber ? ':' + issue.lineNumber : '');
  const callers = callersOf(callGraph);
  const production = security.issues.filter((issue) => !issue.inTest).sort(bySeverity);

  const traced = production.filter((issue) => issue.confidence === 'flow' && issue.flow);
  const tracedFlows = traced.slice(0, TRACED_FLOW_LIMIT).map((issue): TracedFlowContext => {
    const flow = issue.flow!;
    const context: TracedFlowContext = {
      category: issue.category,
      severity: issue.type,
      file: relative(issue.filePath),
      path: [
        { role: 'input', ...flow.source },
        ...flow.steps.map((step) => ({ role: 'via' as const, ...step })),
        { role: 'sink', ...flow.sink },
      ],
    };
    if (flow.function) {
      context.function = flow.function;
      const callerNames = callers(flow.function);
      if (callerNames.length) context.callers = callerNames;
    }
    return context;
  });

  const untraced = new Map<string, UntracedPatternContext>();
  for (const issue of production.filter((candidate) => candidate.confidence === 'pattern')) {
    const group = untraced.get(issue.category) ?? { category: issue.category, count: 0, examples: [] };
    group.count++;
    if (group.examples.length < EXAMPLE_LIMIT) group.examples.push(location(issue));
    untraced.set(issue.category, group);
  }

  const other = production.filter((issue) => !issue.confidence);
  return {
    score: security.overallScore,
    grade: security.grade,
    counts: { critical: security.summary.critical, high: security.summary.high, medium: security.summary.medium, low: security.summary.low + security.summary.info },
    testFindings: security.issues.length - production.length,
    tracedFlows,
    untracedPatterns: [...untraced.values()].sort((a, b) => b.count - a.count),
    otherFindings: other.slice(0, OTHER_FINDING_LIMIT).map((issue) => ({ category: issue.category, severity: issue.type, location: location(issue) })),
    truncated: { tracedFlows: Math.max(0, traced.length - TRACED_FLOW_LIMIT), otherFindings: Math.max(0, other.length - OTHER_FINDING_LIMIT) },
  };
}
