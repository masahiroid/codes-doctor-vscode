import { TechnicalDebtScore, TechnicalDebtMetricDetail, GodClassResult, ModuleMetrics, CircularDependency } from '../types';
import { scoreToGrade, GradeThresholds } from './grading';
import { isThinOrchestrationModule } from './moduleClassification';

const TECHNICAL_DEBT_GRADE_THRESHOLDS: GradeThresholds = { a: 83, b: 70, c: 55, d: 40 };

/** Relative weight of each metric in the overall technical debt score (must sum to 1.0) */
const METRIC_WEIGHTS = {
  codeComplexity: 0.4,
  maintainability: 0.3,
  circularDeps: 0.3,
} as const;

/** Score thresholds below which a metric counts as a critical/high issue.
 * Exported since report/sections/riskSections.ts recomputes the same breakdown for display. */
export const ISSUE_SEVERITY_SCORE_THRESHOLDS = {
  critical: 40,
  high: 60,
} as const;

/** Cycle length thresholds used to bucket circular dependencies by severity.
 * Exported since report/sections/riskSections.ts recomputes the same breakdown for display. */
export const CYCLE_LENGTH_THRESHOLDS = {
  critical: 5, // length > 5
  highMax: 5, // 3 < length <= 5
  medium: 3, // length === 3
  low: 2, // length === 2
} as const;

/** Penalty applied per God Class, by rank, normalized over total file count */
const GOD_CLASS_PENALTY_WEIGHTS = {
  critical: 15,
  high: 8,
  medium: 3,
} as const;

/** Instability above this is considered a maintainability problem for a module */
const HIGH_INSTABILITY_THRESHOLD = 0.8;
/** Below this instability a module is considered stable */
const STABLE_INSTABILITY_THRESHOLD = 0.3;
/** Centrality above this is considered a sign of tight coupling */
const HIGH_CENTRALITY_THRESHOLD = 0.5;
/** Share of modules with high centrality above which it's worth flagging */
const HIGH_CENTRALITY_SHARE_THRESHOLD = 0.3;
/** Max points deducted from the maintainability score for unstable modules */
const MAX_INSTABILITY_PENALTY = 20;

/** Cycle length above which a circular dependency is considered "complex" (score detail) */
const COMPLEX_CYCLE_LENGTH = 4;
/** Cycle length above which a circular dependency is flagged as priority in recommendations */
const PRIORITY_CYCLE_LENGTH = 3;
/** Scales total cycle complexity (sum of cycle lengths) into a 0-100 penalty */
const CIRCULAR_DEPS_PENALTY_SCALE = 50;

const TOP_ITEMS_LIMIT = 3;

/** Score thresholds for the per-metric human-readable explanation text */
const EXPLANATION_SCORE_THRESHOLDS = {
  good: 90,
  acceptable: 70,
  concerning: 50,
} as const;

/** Maintainability explanation has an extra tier below "concerning" */
const MAINTAINABILITY_EXPLANATION_THRESHOLDS = {
  good: 90,
  acceptable: 70,
  concerning: 50,
  poor: 40,
} as const;

/** Converts a God Class penalty ratio (issues per file) into a 0-100 scale */
const GOD_CLASS_PENALTY_SCALE = 100;

/** Number of complex-cycle examples shown in the problems list */
const COMPLEX_CYCLE_EXAMPLE_LIMIT = 2;
/** Number of module names shown per cycle example */
const CYCLE_PATH_PREVIEW_LENGTH = 3;

/**
 * Calculate technical debt score based on various metrics
 */
export function calculateTechnicalDebt(
  godClasses: GodClassResult[],
  moduleMetrics: ModuleMetrics[],
  circularDeps: CircularDependency[],
  totalFiles: number
): TechnicalDebtScore {
  const codeComplexityDetail = calculateCodeComplexityScore(godClasses, totalFiles);
  const maintainabilityDetail = calculateMaintainabilityScore(moduleMetrics);
  const circularDepsDetail = calculateCircularDepsScore(circularDeps, totalFiles);

  const metrics = {
    codeComplexity: codeComplexityDetail.score,
    maintainability: maintainabilityDetail.score,
    circularDeps: circularDepsDetail.score,
  };

  const metricsDetail = {
    codeComplexity: codeComplexityDetail,
    maintainability: maintainabilityDetail,
    circularDeps: circularDepsDetail,
  };

  const weightedMetrics = [
    { score: metrics.codeComplexity, weight: METRIC_WEIGHTS.codeComplexity },
    { score: metrics.maintainability, weight: METRIC_WEIGHTS.maintainability },
    { score: metrics.circularDeps, weight: METRIC_WEIGHTS.circularDeps },
  ];
  const totalWeight = weightedMetrics.reduce((sum, metric) => sum + metric.weight, 0);

  const overallScore = totalWeight > 0
    ? Math.round(
        weightedMetrics.reduce((sum, metric) => sum + metric.score * metric.weight, 0) / totalWeight
      )
    : 100;

  const grade = scoreToGrade(overallScore, TECHNICAL_DEBT_GRADE_THRESHOLDS);

  // Count issues by severity based on both specific issues and metric scores
  const { critical: criticalScoreMax, high: highScoreMax } = ISSUE_SEVERITY_SCORE_THRESHOLDS;
  const { critical: criticalCycleLen, highMax: highCycleLenMax, medium: mediumCycleLen, low: lowCycleLen } = CYCLE_LENGTH_THRESHOLDS;
  const issues = {
    critical:
      (godClasses.filter((gc) => gc.rank === 'critical').length) +
      (circularDeps.filter((cd) => cd.length > criticalCycleLen).length) +
      (metrics.codeComplexity < criticalScoreMax ? 1 : 0) +
      (metrics.maintainability < criticalScoreMax ? 1 : 0),
    high:
      (godClasses.filter((gc) => gc.rank === 'high').length) +
      (circularDeps.filter((cd) => cd.length > mediumCycleLen && cd.length <= highCycleLenMax).length) +
      (metrics.codeComplexity >= criticalScoreMax && metrics.codeComplexity < highScoreMax ? 1 : 0) +
      (metrics.maintainability >= criticalScoreMax && metrics.maintainability < highScoreMax ? 1 : 0) +
      (metrics.circularDeps < highScoreMax ? 1 : 0),
    medium:
      (godClasses.filter((gc) => gc.rank === 'medium').length) +
      (circularDeps.filter((cd) => cd.length === mediumCycleLen).length),
    low:
      (godClasses.filter((gc) => gc.rank === 'low').length) +
      (circularDeps.filter((cd) => cd.length === lowCycleLen).length),
  };

  const recommendations = generateRecommendations(metrics, issues, godClasses, circularDeps, moduleMetrics);
  const summary = generateSummary(overallScore, grade, issues);

  return {
    overallScore,
    grade,
    metrics,
    metricsDetail,
    issues,
    recommendations,
    summary,
  };
}

/**
 * Calculate code complexity score from God Classes
 * Returns detailed metric information
 */
function calculateCodeComplexityScore(godClasses: GodClassResult[], totalFiles: number): TechnicalDebtMetricDetail {
  if (totalFiles === 0) {
    return {
      score: 100,
      explanation: '分析するファイルがありません',
      problems: [],
      goodPoints: ['ファイルが存在しないため、問題はありません'],
    };
  }

  const criticalCount = godClasses.filter((gc) => gc.rank === 'critical').length;
  const highCount = godClasses.filter((gc) => gc.rank === 'high').length;
  const mediumCount = godClasses.filter((gc) => gc.rank === 'medium').length;
  // Penalty based on severity
  const penalty =
    (criticalCount * GOD_CLASS_PENALTY_WEIGHTS.critical +
      highCount * GOD_CLASS_PENALTY_WEIGHTS.high +
      mediumCount * GOD_CLASS_PENALTY_WEIGHTS.medium) /
    totalFiles;
  const score = Math.max(0, 100 - penalty * GOD_CLASS_PENALTY_SCALE);

  const problems: string[] = [];
  const goodPoints: string[] = [];

  if (criticalCount > 0) {
    problems.push(`${criticalCount}個のクリティカルレベルのGod Classが存在します（メソッド数>20または行数>500）`);
    const topCritical = godClasses
      .filter((gc) => gc.rank === 'critical')
      .slice(0, TOP_ITEMS_LIMIT)
      .map((gc) => `${gc.className}（メソッド:${gc.methodCount}, 行数:${gc.lineCount}）`);
    if (topCritical.length > 0) {
      problems.push(`最も深刻なクラス: ${topCritical.join(', ')}`);
    }
  }

  if (highCount > 0) {
    problems.push(`${highCount}個の高複雑度クラスが存在します`);
  }

  if (mediumCount > 0) {
    problems.push(`${mediumCount}個の中程度の複雑度クラスが存在します`);
  }

  if (godClasses.length === 0) {
    goodPoints.push('God Classは検出されませんでした');
  } else if (criticalCount === 0 && highCount === 0) {
    goodPoints.push('深刻な複雑度の問題はありません');
  }

  if (godClasses.length > 0) {
    const avgMethodCount = godClasses.reduce((sum, gc) => sum + gc.methodCount, 0) / godClasses.length;
    const avgLineCount = godClasses.reduce((sum, gc) => sum + gc.lineCount, 0) / godClasses.length;
    goodPoints.push(`クラスあたりの平均メソッド数: ${avgMethodCount.toFixed(1)}, 平均行数: ${avgLineCount.toFixed(0)}`);
  }

  let explanation = '';
  if (score >= EXPLANATION_SCORE_THRESHOLDS.good) {
    explanation = 'コードの複雑度は非常に良好です。適切なクラスサイズが維持されています。';
  } else if (score >= EXPLANATION_SCORE_THRESHOLDS.acceptable) {
    explanation = 'コードの複雑度はおおむね良好ですが、一部改善の余地があります。';
  } else if (score >= EXPLANATION_SCORE_THRESHOLDS.concerning) {
    explanation = 'コードの複雑度に問題があります。大きなクラスのリファクタリングを検討してください。';
  } else {
    explanation = 'コードの複雑度が深刻な状態です。早急なリファクタリングが必要です。';
  }

  return {
    score: Math.round(score),
    explanation,
    problems,
    goodPoints,
    includedInOverall: true,
    measurementStatus: 'measured',
  };
}

/**
 * Calculate maintainability score from module metrics
 * Returns detailed metric information
 */
function calculateMaintainabilityScore(moduleMetrics: ModuleMetrics[]): TechnicalDebtMetricDetail {
  if (moduleMetrics.length === 0) {
    return {
      score: 100,
      explanation: 'モジュールメトリクスが利用できません',
      problems: [],
      goodPoints: [],
    };
  }

  // Exclude thin orchestration modules from the structural score average.
  // These naturally have high instability (many fan-outs, few fan-ins) and are NOT design problems.
  const nonOrchestrators = moduleMetrics.filter((m) => !isThinOrchestrationModule(m));
  const eligibleMetrics = nonOrchestrators.length > 0 ? nonOrchestrators : moduleMetrics;
  const avgStructuralScore = eligibleMetrics.reduce((sum, m) => sum + m.structuralScore, 0) / eligibleMetrics.length;

  // Penalty for genuinely unstable modules (thin orchestrators are excluded)
  const highInstabilityModules = moduleMetrics.filter(
    (m) => m.instability > HIGH_INSTABILITY_THRESHOLD && !isThinOrchestrationModule(m)
  );
  const instabilityPenalty = (highInstabilityModules.length / moduleMetrics.length) * MAX_INSTABILITY_PENALTY;

  const score = Math.max(0, avgStructuralScore - instabilityPenalty);

  const problems: string[] = [];
  const goodPoints: string[] = [];

  if (highInstabilityModules.length > 0) {
    problems.push(`${highInstabilityModules.length}個のモジュールが不安定です（Instability > ${HIGH_INSTABILITY_THRESHOLD}）`);
    const topUnstable = highInstabilityModules
      .slice(0, TOP_ITEMS_LIMIT)
      .map((m) => `${m.moduleName}（I=${m.instability.toFixed(2)}, FanOut=${m.fanOut}）`);
    problems.push(`最も不安定なモジュール: ${topUnstable.join(', ')}`);
  }

  const highCentralityModules = moduleMetrics.filter((m) => m.centrality > HIGH_CENTRALITY_THRESHOLD);
  if (highCentralityModules.length > moduleMetrics.length * HIGH_CENTRALITY_SHARE_THRESHOLD) {
    problems.push(`${highCentralityModules.length}個のモジュールが高い中心性を持っています（密結合の可能性）`);
  }

  const stableModules = moduleMetrics.filter((m) => m.instability < STABLE_INSTABILITY_THRESHOLD);
  if (stableModules.length > 0) {
    goodPoints.push(`${stableModules.length}個の安定したモジュールが存在します`);
  }
  const thinOrchestrationModules = moduleMetrics.filter((m) => isThinOrchestrationModule(m));
  if (thinOrchestrationModules.length > 0) {
    goodPoints.push(`${thinOrchestrationModules.length}個の薄いオーケストレーションモジュールは軽量構成として評価しています`);
  }
  goodPoints.push(
    `平均構造スコア: ${avgStructuralScore.toFixed(1)}（参照数・安定性・サイズの合成値。典型は30〜60）`,
    `総モジュール数: ${moduleMetrics.length}`
  );

  let explanation = '';
  if (score >= MAINTAINABILITY_EXPLANATION_THRESHOLDS.good) {
    explanation = 'モジュール構造は非常に良好です。適切な疎結合が実現されています。';
  } else if (score >= MAINTAINABILITY_EXPLANATION_THRESHOLDS.acceptable) {
    explanation = 'モジュール構造はおおむね良好ですが、一部のモジュールで改善の余地があります。';
  } else if (score >= MAINTAINABILITY_EXPLANATION_THRESHOLDS.concerning) {
    explanation = 'モジュール間の結合度が高くなっています。疎結合化を検討してください。';
  } else if (score >= MAINTAINABILITY_EXPLANATION_THRESHOLDS.poor) {
    explanation = '一部のモジュールで結合度が高くなっています。依存関係の整理を検討してください。';
  } else {
    explanation = 'モジュール構造に深刻な問題があります。アーキテクチャの見直しが必要です。';
  }

  return {
    score: Math.round(score),
    explanation,
    problems,
    goodPoints,
    includedInOverall: true,
    measurementStatus: 'measured',
  };
}

/**
 * Calculate circular dependencies score
 * Returns detailed metric information
 */
function calculateCircularDepsScore(circularDeps: CircularDependency[], totalFiles: number): TechnicalDebtMetricDetail {
  if (totalFiles === 0) {
    return {
      score: 100,
      explanation: '分析するファイルがありません',
      problems: [],
      goodPoints: [],
    };
  }

  if (circularDeps.length === 0) {
    return {
      score: 100,
      explanation: '循環依存は検出されませんでした',
      problems: [],
      goodPoints: ['循環依存がないため、依存関係は健全です'],
      includedInOverall: true,
      measurementStatus: 'measured',
    };
  }

  // Penalty based on number and length of cycles
  const totalCycleComplexity = circularDeps.reduce((sum, cd) => sum + cd.length, 0);
  const penalty = (totalCycleComplexity / totalFiles) * CIRCULAR_DEPS_PENALTY_SCALE;

  const score = Math.max(0, 100 - penalty);

  const problems: string[] = [];
  const goodPoints: string[] = [];

  problems.push(`${circularDeps.length}個の循環依存が検出されました`);

  const complexCycles = circularDeps.filter((cd) => cd.length > COMPLEX_CYCLE_LENGTH);
  if (complexCycles.length > 0) {
    problems.push(`${complexCycles.length}個の複雑な循環依存（長さ${COMPLEX_CYCLE_LENGTH + 1}以上）が存在します`);
    const topComplex = complexCycles
      .slice(0, COMPLEX_CYCLE_EXAMPLE_LIMIT)
      .map((cd) => `${cd.cycle.slice(0, CYCLE_PATH_PREVIEW_LENGTH).join(' → ')}... (長さ${cd.length})`);
    problems.push(`複雑な循環: ${topComplex.join(' / ')}`);
  }

  const simpleCycles = circularDeps.filter((cd) => cd.length === CYCLE_LENGTH_THRESHOLDS.low);
  if (simpleCycles.length > 0) {
    goodPoints.push(`${simpleCycles.length}個は単純な相互参照（長さ${CYCLE_LENGTH_THRESHOLDS.low}）で比較的解消しやすいです`);
  }

  let explanation = '';
  if (score >= EXPLANATION_SCORE_THRESHOLDS.good) {
    explanation = '循環依存は最小限です。';
  } else if (score >= EXPLANATION_SCORE_THRESHOLDS.acceptable) {
    explanation = '一部の循環依存が存在します。計画的な解消を推奨します。';
  } else if (score >= EXPLANATION_SCORE_THRESHOLDS.concerning) {
    explanation = '循環依存が多数存在します。優先的に対処してください。';
  } else {
    explanation = '循環依存が深刻な状態です。早急な対処が必要です。';
  }

  return {
    score: Math.round(score),
    explanation,
    problems,
    goodPoints,
    includedInOverall: true,
    measurementStatus: 'measured',
  };
}

/**
 * Generate actionable recommendations based on actual problems
 */
function generateRecommendations(
  metrics: TechnicalDebtScore['metrics'],
  issues: TechnicalDebtScore['issues'],
  godClasses: GodClassResult[],
  circularDeps: CircularDependency[],
  moduleMetrics: ModuleMetrics[]
): string[] {
  const recommendations: string[] = [];

  // Code complexity recommendations - only if there are actual problems
  if (metrics.codeComplexity < EXPLANATION_SCORE_THRESHOLDS.acceptable) {
    if (issues.critical > 0) {
      recommendations.push(`${issues.critical}個のクリティカルなGod Classをリファクタリングすることを強く推奨します`);
    }
    if (issues.high > 0) {
      recommendations.push(`${issues.high}個の高複雑度クラスを小さなクラスに分割することを検討してください`);
    }
    const topGodClasses = godClasses
      .filter((gc) => gc.rank === 'critical' || gc.rank === 'high')
      .slice(0, TOP_ITEMS_LIMIT)
      .map((gc) => gc.className);
    if (topGodClasses.length > 0) {
      recommendations.push(`優先的に対処すべきクラス: ${topGodClasses.join(', ')}`);
    }
  }

  // Maintainability recommendations - only if there are actual problems
  if (metrics.maintainability < EXPLANATION_SCORE_THRESHOLDS.acceptable) {
    const highInstabilityModules = moduleMetrics.filter(
      (m) => m.instability > HIGH_INSTABILITY_THRESHOLD && !isThinOrchestrationModule(m)
    );
    if (highInstabilityModules.length > 0) {
      recommendations.push(
        `${highInstabilityModules.length}個の不安定なモジュールの依存関係を見直してください`,
        'Single Responsibility Principleに従ってモジュールを整理してください'
      );
    }
  }

  // Circular dependencies recommendations - only if there are cycles
  if (circularDeps.length > 0) {
    recommendations.push(`${circularDeps.length}個の循環依存を解消してください`);
    const complexCycles = circularDeps.filter((cd) => cd.length > PRIORITY_CYCLE_LENGTH);
    if (complexCycles.length > 0) {
      recommendations.push(`特に${complexCycles.length}個の複雑な循環依存（長さ${PRIORITY_CYCLE_LENGTH + 1}以上）に優先的に対処してください`);
    }
    recommendations.push('Dependency Inversionパターンまたはインターフェース分離の適用を検討してください');
  }

  // Overall recommendations when everything is good
  if (recommendations.length === 0) {
    recommendations.push(
      'コード品質は良好な状態です。この状態を維持してください。',
      '定期的なコードレビューとリファクタリングの継続を推奨します。'
    );
  }

  return recommendations;
}

/**
 * Generate overall summary
 */
function generateSummary(overallScore: number, grade: string, issues: TechnicalDebtScore['issues']): string {
  const totalIssues = issues.critical + issues.high + issues.medium + issues.low;
  const scopeNote = '未実装のテストカバレッジとドキュメント評価は総合点から除外しています。';
  
  if (totalIssues === 0) {
    return `総合スコア${overallScore}点（グレード${grade}）: 検出された重大な問題はありません。${scopeNote}`;
  }
  
  if (grade === 'A') {
    return `総合スコア${overallScore}点（グレード${grade}）: コードベースは非常に健全な状態です。${scopeNote}`;
  } else if (grade === 'B') {
    return `総合スコア${overallScore}点（グレード${grade}）: コードベースは良好な状態ですが、${totalIssues}件の改善点があります。（Critical: ${issues.critical}件、High: ${issues.high}件、Medium: ${issues.medium}件）${scopeNote}`;
  } else if (grade === 'C') {
    return `総合スコア${overallScore}点（グレード${grade}）: ${totalIssues}件の問題が検出されました。（Critical: ${issues.critical}件、High: ${issues.high}件、Medium: ${issues.medium}件、Low: ${issues.low}件）計画的な改善を推奨します。${scopeNote}`;
  } else if (grade === 'D') {
    return `総合スコア${overallScore}点（グレード${grade}）: ${totalIssues}件の問題があり、特にCritical（${issues.critical}件）とHigh（${issues.high}件）レベルの${issues.critical + issues.high}件は優先的な対処が必要です。${scopeNote}`;
  } else {
    return `総合スコア${overallScore}点（グレード${grade}）: 深刻な状態です。${issues.critical}件のクリティカルな問題を含む${totalIssues}件の問題に早急に対処してください。（Critical: ${issues.critical}件、High: ${issues.high}件、Medium: ${issues.medium}件、Low: ${issues.low}件）${scopeNote}`;
  }
}

