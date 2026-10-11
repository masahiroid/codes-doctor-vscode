/**
 * Unified Cyclomatic Complexity calculation for JavaScript/TypeScript and PHP
 * CC = 1 + number of decision points (if, switch, case, for, while, catch, etc.)
 */

import { AnalysisLanguage } from '../types';

/** Minimum cyclomatic complexity (one path through any function) */
const MIN_CYCLOMATIC_COMPLEXITY = 1;

/** Caps how many &&/|| operators count toward complexity, to avoid over-counting dense conditions */
const LOGICAL_OPERATOR_COMPLEXITY_CAP = 5;

/** Complexity rating boundaries */
const COMPLEXITY_RATING_THRESHOLDS = {
  low: 5,
  moderate: 10,
  high: 20,
} as const;

/**
 * Calculate Cyclomatic Complexity from source code content
 * Works for both JavaScript/TypeScript and PHP
 */
export function calculateCyclomaticComplexity(sourceCode: string, language: AnalysisLanguage): number {
  if (!sourceCode || sourceCode.length === 0) {
    return MIN_CYCLOMATIC_COMPLEXITY;
  }

  // Count decision points (branches, loops, exception handlers)
  let decisionPoints = 0;

  // Remove comments and strings to avoid counting them
  const cleanCode = removeCommentsAndStrings(sourceCode, language);

  // Count decision points
  const patterns: { [key: string]: RegExp } = {
    ifStatement: /\bif\s*\(/g,
    elseIfStatement: /\belse\s+if\s*\(/g,
    switchStatement: /\bswitch\s*\(/g,
    caseStatement: /\bcase\s+/g,
    defaultStatement: /\bdefault\s*:/g,
    forLoop: /\bfor\s*\(/g,
    forEachLoop: /\bfor(?:Each|...of|...in)\s*\(/g,
    whileLoop: /\bwhile\s*\(/g,
    doWhileLoop: /\bdo\s*{/g,
    catchBlock: /\bcatch\s*\(/g,
    ternaryOperator: /\?.*:/g,
    logicalAnd: /&&/g,
    logicalOr: /\|\|/g,
  };

  // Count each pattern
  for (const [name, pattern] of Object.entries(patterns)) {
    const matches = cleanCode.match(pattern);
    if (matches) {
      // Special handling for some patterns
      if (name === 'elseIfStatement') {
        decisionPoints += matches.length; // Each else-if adds 1
      } else if (name === 'defaultStatement') {
        // Default doesn't add complexity (fallthrough)
        continue;
      } else if (name === 'caseStatement') {
        // Case statements add complexity beyond switch
        decisionPoints += Math.max(0, matches.length - 1);
      } else if (name === 'ternaryOperator') {
        decisionPoints += matches.length;
      } else if (name === 'logicalAnd' || name === 'logicalOr') {
        // Logical operators in conditions add to complexity
        decisionPoints += Math.min(matches.length, LOGICAL_OPERATOR_COMPLEXITY_CAP);
      } else {
        decisionPoints += matches.length;
      }
    }
  }

  return Math.max(MIN_CYCLOMATIC_COMPLEXITY, decisionPoints + 1);
}

/**
 * Remove comments and string literals from code
 * Prevents counting decision points inside comments
 */
function removeCommentsAndStrings(code: string, language: AnalysisLanguage): string {
  let result = code;

  if (language === 'php') {
    // Remove PHP comments
    // Single-line: // and #
    result = result.replaceAll(/\/\/.*$/gm, '');
    result = result.replaceAll(/#.*$/gm, '');
    // Multi-line: /* ... */
    result = result.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  } else {
    // Remove JavaScript/TypeScript comments
    // Single-line: //
    result = result.replaceAll(/\/\/.*$/gm, '');
    // Multi-line: /* ... */
    result = result.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  }

  // Remove string literals to avoid counting keywords inside strings
  // Double-quoted strings
  result = result.replaceAll(/"(?:\\.|[^"\\])*"/g, '""');
  // Single-quoted strings
  result = result.replaceAll(/'(?:\\.|[^'\\])*'/g, "''");
  // Backtick strings (template literals)
  result = result.replaceAll(/`(?:\\.|[^`\\])*`/g, '``');

  return result;
}

/**
 * Get complexity classification
 */
export function getComplexityRating(cc: number): 'low' | 'moderate' | 'high' | 'very-high' {
  if (cc <= COMPLEXITY_RATING_THRESHOLDS.low) return 'low';
  if (cc <= COMPLEXITY_RATING_THRESHOLDS.moderate) return 'moderate';
  if (cc <= COMPLEXITY_RATING_THRESHOLDS.high) return 'high';
  return 'very-high';
}

/**
 * Calculate average Cyclomatic Complexity for a class/function with source code
 */
export function calculateAverageCyclomaticComplexity(
  methods: Array<{ name: string; sourceCode?: string }>,
  language: AnalysisLanguage
): number {
  if (methods.length === 0) return MIN_CYCLOMATIC_COMPLEXITY;

  const complexities = methods.map((method) => {
    if (method.sourceCode) {
      return calculateCyclomaticComplexity(method.sourceCode, language);
    }
    return MIN_CYCLOMATIC_COMPLEXITY;
  });

  const sum = complexities.reduce((a, b) => a + b, 0);
  return Math.round((sum / complexities.length) * 10) / 10;
}
