import { ModuleMetrics } from '../types';

/** A module is a "thin orchestrator" (naturally high fan-out/instability, not a design
 * problem) if it's small and few others depend on it. fanOut is NOT restricted — an
 * orchestrator naturally imports many sub-modules.
 *
 * Shared by technicalDebt.ts (excludes these from the maintainability average) and
 * moduleMetricsSection.ts (labels them "entrypoint" in the report table) — both must agree
 * on the same definition, so it lives here as the single source of truth. */
const THIN_ORCHESTRATOR_MAX_LINES = 150;
const THIN_ORCHESTRATOR_MAX_FAN_IN = 2;

export function isThinOrchestrationModule(
  metric: Pick<ModuleMetrics, 'lineCount' | 'fanIn'>
): boolean {
  return (
    metric.lineCount > 0 &&
    metric.lineCount <= THIN_ORCHESTRATOR_MAX_LINES &&
    metric.fanIn <= THIN_ORCHESTRATOR_MAX_FAN_IN
  );
}
