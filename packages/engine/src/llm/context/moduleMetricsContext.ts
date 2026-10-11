import { ModuleMetrics } from '../../types';
import { P50, P90, percentile } from './percentile';

/** Instability above this is reported as "unstable" in the LLM context summary */
const UNSTABLE_INSTABILITY_THRESHOLD = 0.8;
/** Instability at or below this is reported as "stable" */
const STABLE_INSTABILITY_THRESHOLD = 0.5;

/** A module is a lightweight entrypoint/script if it's small with few dependents and dependencies.
 * Distinct from (and stricter than) technicalDebt.ts's thin-orchestrator check, which only
 * excludes modules from the maintainability average — this one explains high instability
 * directly to the LLM so it isn't mistaken for a design problem. */
const LIGHTWEIGHT_ENTRYPOINT_THRESHOLDS = {
  maxLines: 80,
  maxFanIn: 1,
  maxFanOut: 3,
};

const TOP_N_LIST_SIZE = 8;
const HOTSPOT_LIST_SIZE = 12;
const SHARED_FOUNDATION_LIST_SIZE = 8;
const REVIEW_TARGET_LIST_SIZE = 10;

type MetricSubset = Pick<ModuleMetrics, 'lineCount' | 'fanIn' | 'fanOut'>;

function isLightweightEntrypointModule(metric: MetricSubset): boolean {
  return (
    metric.lineCount > 0 &&
    metric.lineCount <= LIGHTWEIGHT_ENTRYPOINT_THRESHOLDS.maxLines &&
    metric.fanIn <= LIGHTWEIGHT_ENTRYPOINT_THRESHOLDS.maxFanIn &&
    metric.fanOut <= LIGHTWEIGHT_ENTRYPOINT_THRESHOLDS.maxFanOut
  );
}

function isSharedFoundationModule(
  metric: Pick<ModuleMetrics, 'fanIn' | 'fanOut' | 'structuralScore'>,
  fanInP90: number,
  fanOutP50: number,
  structuralP50: number
): boolean {
  return metric.fanIn >= fanInP90 && metric.fanOut <= fanOutP50 && metric.structuralScore >= structuralP50;
}

export interface ModuleMetricsContext {
  totalModules: number;
  unstableCount: number;
  naturalInstabilityCount: number;
  stableCount: number;
  avgStructuralScore: number;
  stats: {
    fanInP50: number;
    fanInP90: number;
    fanOutP50: number;
    fanOutP90: number;
    instabilityP50: number;
    instabilityP90: number;
    structuralP10: number;
    structuralP50: number;
  };
  topFanIn: ModuleMetrics[];
  topFanOut: ModuleMetrics[];
  topUnstable: ModuleMetrics[];
  hotspots: Array<{
    moduleName: string;
    filePath: string;
    lineCount: number;
    fanIn: number;
    fanOut: number;
    instability: number;
    structuralScore: number;
    reasons: string[];
  }>;
  naturalEntrypoints: Array<{
    moduleName: string;
    filePath: string;
    lineCount: number;
    fanIn: number;
    fanOut: number;
    instability: number;
    explanation: string;
  }>;
  sharedFoundationModules: Array<{
    moduleName: string;
    filePath: string;
    lineCount: number;
    fanIn: number;
    fanOut: number;
    instability: number;
    structuralScore: number;
    explanation: string;
  }>;
  reviewTargets: Array<{
    moduleName: string;
    filePath: string;
    lineCount: number;
    fanIn: number;
    fanOut: number;
    instability: number;
    structuralScore: number;
    reasons: string[];
    reviewPriority: 'high' | 'medium';
  }>;
}

export function buildModuleMetricsContext(moduleMetrics: ModuleMetrics[]): ModuleMetricsContext {
  const sortedByFanIn = [...moduleMetrics].sort((a, b) => b.fanIn - a.fanIn);
  const sortedByFanOut = [...moduleMetrics].sort((a, b) => b.fanOut - a.fanOut);
  const sortedByInstability = [...moduleMetrics].sort((a, b) => b.instability - a.instability);

  const unstableCount = moduleMetrics.filter((m) => m.instability > UNSTABLE_INSTABILITY_THRESHOLD).length;
  const stableCount = moduleMetrics.filter((m) => m.instability <= STABLE_INSTABILITY_THRESHOLD).length;
  const avgStructuralScore = moduleMetrics.length
    ? moduleMetrics.reduce((sum, m) => sum + m.structuralScore, 0) / moduleMetrics.length
    : 0;

  const fanInValues = moduleMetrics.map((m) => m.fanIn);
  const fanOutValues = moduleMetrics.map((m) => m.fanOut);
  const instabilityValues = moduleMetrics.map((m) => m.instability);
  const structuralValues = moduleMetrics.map((m) => m.structuralScore);

  const fanInP90 = percentile(fanInValues, P90);
  const fanOutP90 = percentile(fanOutValues, P90);
  const instabilityP90 = percentile(instabilityValues, P90);
  const structuralP10 = percentile(structuralValues, 10);

  const fanInP50 = percentile(fanInValues, P50);
  const fanOutP50 = percentile(fanOutValues, P50);
  const instabilityP50 = percentile(instabilityValues, P50);
  const structuralP50 = percentile(structuralValues, P50);

  const naturalEntrypoints = moduleMetrics
    .filter((metric) => isLightweightEntrypointModule(metric))
    .map((metric) => ({
      moduleName: metric.moduleName,
      filePath: metric.filePath,
      lineCount: metric.lineCount,
      fanIn: metric.fanIn,
      fanOut: metric.fanOut,
      instability: Number(metric.instability.toFixed(2)),
      explanation: '薄い入口または実行スクリプトです。Instability が高くても直ちに設計問題とは限りません。',
    }));

  const hotspots = moduleMetrics
    .map((m) => {
      const reasons: string[] = [];
      if (m.fanOut >= fanOutP90) reasons.push('高fan-out');
      if (m.fanIn >= fanInP90) reasons.push('高fan-in');
      if (m.instability >= instabilityP90) reasons.push('高不安定');
      if (m.structuralScore <= structuralP10) reasons.push('低構造スコア');
      return {
        moduleName: m.moduleName,
        filePath: m.filePath,
        lineCount: m.lineCount,
        fanIn: m.fanIn,
        fanOut: m.fanOut,
        instability: Number(m.instability.toFixed(2)),
        structuralScore: Number(m.structuralScore.toFixed(1)),
        reasons,
      };
    })
    .filter((m) => m.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, HOTSPOT_LIST_SIZE);

  const sharedFoundationModules = moduleMetrics
    .filter((metric) => isSharedFoundationModule(metric, fanInP90, fanOutP50, structuralP50))
    .slice(0, SHARED_FOUNDATION_LIST_SIZE)
    .map((metric) => ({
      moduleName: metric.moduleName,
      filePath: metric.filePath,
      lineCount: metric.lineCount,
      fanIn: metric.fanIn,
      fanOut: metric.fanOut,
      instability: Number(metric.instability.toFixed(2)),
      structuralScore: Number(metric.structuralScore.toFixed(1)),
      explanation: '高fan-inの共有基盤モジュールです。広く参照されていますが、低fan-outなら直ちに悪い構造とは限りません。',
    }));

  const reviewTargets = hotspots
    .filter(
      (metric) =>
        !isLightweightEntrypointModule(metric) &&
        !isSharedFoundationModule(metric, fanInP90, fanOutP50, structuralP50)
    )
    .map((metric) => ({
      ...metric,
      reviewPriority: metric.fanOut >= fanOutP90 || metric.structuralScore <= structuralP10 ? 'high' as const : 'medium' as const,
    }))
    .sort((left, right) => {
      if (left.reviewPriority !== right.reviewPriority) {
        return left.reviewPriority === 'high' ? -1 : 1;
      }
      return left.structuralScore - right.structuralScore;
    })
    .slice(0, REVIEW_TARGET_LIST_SIZE);

  return {
    totalModules: moduleMetrics.length,
    unstableCount,
    naturalInstabilityCount: naturalEntrypoints.length,
    stableCount,
    avgStructuralScore: Number(avgStructuralScore.toFixed(2)),
    stats: {
      fanInP50,
      fanInP90,
      fanOutP50,
      fanOutP90,
      instabilityP50: Number(instabilityP50.toFixed(2)),
      instabilityP90: Number(instabilityP90.toFixed(2)),
      structuralP10: Number(structuralP10.toFixed(1)),
      structuralP50: Number(structuralP50.toFixed(1)),
    },
    topFanIn: sortedByFanIn.slice(0, TOP_N_LIST_SIZE),
    topFanOut: sortedByFanOut.slice(0, TOP_N_LIST_SIZE),
    topUnstable: sortedByInstability.slice(0, TOP_N_LIST_SIZE),
    hotspots,
    naturalEntrypoints,
    sharedFoundationModules,
    reviewTargets,
  };
}
