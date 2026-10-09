import { CircularDependency } from '../../types';

const SAMPLE_CYCLE_LIST_SIZE = 5;
const SAMPLE_CYCLE_PATH_PREVIEW_LENGTH = 8;

export interface CircularDependencyContext {
  count: number;
  longestCycleLength: number;
  sampleCycles: string[][];
}

export function buildCircularDependencyContext(
  circularDeps: CircularDependency[]
): CircularDependencyContext {
  const longestCycleLength = circularDeps.reduce((max, c) => Math.max(max, c.length), 0);
  const sampleCycles = circularDeps
    .slice(0, SAMPLE_CYCLE_LIST_SIZE)
    .map((c) => c.cycle.slice(0, SAMPLE_CYCLE_PATH_PREVIEW_LENGTH));

  return {
    count: circularDeps.length,
    longestCycleLength,
    sampleCycles,
  };
}
