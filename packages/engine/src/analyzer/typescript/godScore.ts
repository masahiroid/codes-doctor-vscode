import { GodClassResult } from '../../types';
import { calculateCyclomaticComplexity, getComplexityRating } from '../complexityAnalysis';

interface GodScoreInput {
  name: string;
  filePath: string;
  lineCount: number;
  methodCount: number;
  propertyCount: number;
  importCount: number;
  sourceCode?: string; // Optional: source code for CC calculation
}

/**
 * Each sub-score caps out at `maxPoints` once `value` reaches `saturatesAt`,
 * contributing proportionally below that.
 */
interface GodScoreComponent {
  saturatesAt: number;
  maxPoints: number;
}

/** Weighted components of the 0-100 God Class score; max points sum to 100. */
const GOD_SCORE_COMPONENTS: Record<'method' | 'line' | 'import' | 'property', GodScoreComponent> = {
  method: { saturatesAt: 20, maxPoints: 40 },
  line: { saturatesAt: 500, maxPoints: 30 },
  import: { saturatesAt: 15, maxPoints: 20 },
  property: { saturatesAt: 20, maxPoints: 10 },
};

/** Cyclomatic complexity above this adds a penalty on top of the base god score */
const HIGH_COMPLEXITY_THRESHOLD = 15;
/** Points added per unit of complexity above the threshold */
const COMPLEXITY_PENALTY_PER_UNIT = 2;
/** Max points the complexity penalty can add */
const MAX_COMPLEXITY_PENALTY = 15;

/** God score thresholds for rank classification */
const GOD_SCORE_RANK_THRESHOLDS = {
  critical: 75,
  high: 50,
  medium: 25,
} as const;

/** Warning thresholds (looser than rank thresholds — these flag individual concerns) */
const WARNING_THRESHOLDS = {
  methodCount: 15,
  lineCount: 300,
  importCount: 10,
};

function scoreComponent(value: number, component: GodScoreComponent): number {
  return Math.min((value / component.saturatesAt) * component.maxPoints, component.maxPoints);
}

/**
 * Calculate "God Class" score for a class (TypeScript or PHP).
 * Enhanced with Cyclomatic Complexity consideration.
 *
 * godScore (0-100) = methodScore + lineScore + importScore + propertyScore,
 * each capped at its component's maxPoints once the metric saturates
 * (see GOD_SCORE_COMPONENTS), plus a penalty for high cyclomatic complexity.
 */
export function calculateGodScore(classInfo: GodScoreInput): GodClassResult {
  const methodScore = scoreComponent(classInfo.methodCount, GOD_SCORE_COMPONENTS.method);
  const lineScore = scoreComponent(classInfo.lineCount, GOD_SCORE_COMPONENTS.line);
  const importScore = scoreComponent(classInfo.importCount, GOD_SCORE_COMPONENTS.import);
  const propertyScore = scoreComponent(classInfo.propertyCount, GOD_SCORE_COMPONENTS.property);

  let godScore = Math.round(methodScore + lineScore + importScore + propertyScore);

  // Calculate and apply Cyclomatic Complexity penalty
  let cyclomaticComplexity: number | undefined;
  if (classInfo.sourceCode) {
    cyclomaticComplexity = calculateCyclomaticComplexity(classInfo.sourceCode, 'typescript');

    if (cyclomaticComplexity > HIGH_COMPLEXITY_THRESHOLD) {
      const complexityPenalty = Math.min(
        (cyclomaticComplexity - HIGH_COMPLEXITY_THRESHOLD) * COMPLEXITY_PENALTY_PER_UNIT,
        MAX_COMPLEXITY_PENALTY
      );
      godScore = Math.min(100, godScore + complexityPenalty);
    }
  }

  const rank = rankFromGodScore(godScore);
  const warnings = buildWarnings(classInfo, cyclomaticComplexity);

  const result: GodClassResult = {
    className: classInfo.name,
    filePath: classInfo.filePath,
    methodCount: classInfo.methodCount,
    lineCount: classInfo.lineCount,
    importCount: classInfo.importCount,
    propertyCount: classInfo.propertyCount,
    godScore,
    rank,
    warnings,
  };

  if (cyclomaticComplexity !== undefined) {
    result.cyclomaticComplexity = cyclomaticComplexity;
  }

  return result;
}

function rankFromGodScore(godScore: number): 'critical' | 'high' | 'medium' | 'low' {
  if (godScore >= GOD_SCORE_RANK_THRESHOLDS.critical) return 'critical';
  if (godScore >= GOD_SCORE_RANK_THRESHOLDS.high) return 'high';
  if (godScore >= GOD_SCORE_RANK_THRESHOLDS.medium) return 'medium';
  return 'low';
}

function buildWarnings(classInfo: GodScoreInput, cyclomaticComplexity: number | undefined): string[] {
  const warnings: string[] = [];
  if (classInfo.methodCount > WARNING_THRESHOLDS.methodCount) {
    warnings.push(`Too many methods (${classInfo.methodCount}). Consider splitting.`);
  }
  if (classInfo.lineCount > WARNING_THRESHOLDS.lineCount) {
    warnings.push(`File too long (${classInfo.lineCount} lines). Extract classes.`);
  }
  if (classInfo.importCount > WARNING_THRESHOLDS.importCount) {
    warnings.push(`High coupling (${classInfo.importCount} imports). Review dependencies.`);
  }
  if (cyclomaticComplexity && cyclomaticComplexity > HIGH_COMPLEXITY_THRESHOLD) {
    const rating = getComplexityRating(cyclomaticComplexity);
    warnings.push(`High cyclomatic complexity (${cyclomaticComplexity}, rating: ${rating}). Simplify logic.`);
  }
  return warnings;
}

/**
 * Rank and sort classes by god score (descending).
 */
export function rankClasses(results: GodClassResult[]): GodClassResult[] {
  return results.sort((a, b) => b.godScore - a.godScore);
}
