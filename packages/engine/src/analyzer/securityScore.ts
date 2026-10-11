import { SecurityScore, SecurityIssue } from '../types';
import type { SecurityLanguage } from './languages/catalog';
import { SECURITY_PATTERNS } from './security/patterns';
import { securityIgnoredRanges } from './security/ignoredRanges';
import { securityEvidence, SecurityEvidence } from './security/syntaxEvidence';
import { isTestPath } from './security/testCode';
import { flowIssues, reconcilePatternIssue } from './security/flowFindings';
import { analyzeFlows, DataFlow, flowGrammarFor } from './flow/taint';
import { SYNTAX_SPECS, LanguageSyntaxSpec } from './syntax';
import fs from 'node:fs';
import path from 'node:path';
import { scoreToGrade, GradeThresholds } from './grading';

/** Score of a codebase with no detected issues. */
const PERFECT_SCORE = 100;

/**
 * Highest score allowed while findings of a severity exist. The density-based score
 * alone would let a large codebase hide a critical finding behind many clean files.
 */
const SEVERITY_SCORE_CAPS = { critical: 59, high: 79, medium: 89, other: 99 } as const;

const SECURITY_GRADE_THRESHOLDS: GradeThresholds = { a: 90, b: 80, c: 70, d: 60 };

/** Points deducted per issue, by severity */
const SEVERITY_PENALTY_WEIGHTS = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 1,
} as const;

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

const TOP_RISK_CATEGORY_LIMIT = 3;
const TOP_RISK_FILE_LIMIT = 3;

/** Divisor flattening the log-scaled issue-density penalty into a 0-100 range */
const PENALTY_LOG_SCALE_DIVISOR = 10;

/**
 * Calculate security score and detect issues
 */
/** One language's parsed files, scanned with that language's pattern family. */
export interface SecurityScanTarget {
  language: SecurityLanguage;
  files: ReadonlyArray<{ filePath: string }>;
}

export async function calculateSecurityScore(targets: readonly SecurityScanTarget[], repoPath: string): Promise<SecurityScore> {
  const issues: SecurityIssue[] = [];
  for (const target of targets) {
    await scanFiles(target.files, repoPath, target.language, issues);
  }

  // The score, its explanation and the top risks are about production code; findings in
  // tests are listed separately.
  const productionIssues = issues.filter((issue) => !issue.inTest);
  const summary = {
    critical: productionIssues.filter((i) => i.type === 'critical').length,
    high: productionIssues.filter((i) => i.type === 'high').length,
    medium: productionIssues.filter((i) => i.type === 'medium').length,
    low: productionIssues.filter((i) => i.type === 'low').length,
    info: productionIssues.filter((i) => i.type === 'info').length,
  };

  // Calculate overall score (0-100, higher is better)
  const totalFiles = targets.reduce((sum, target) => sum + target.files.length, 0);
  const overallScore = calculateScore(summary, totalFiles);
  const grade = scoreToGrade(overallScore, SECURITY_GRADE_THRESHOLDS);

  // Generate category breakdown
  const categoryBreakdown = generateCategoryBreakdown(productionIssues);
  
  // Generate explanation
  const explanation = generateExplanation(overallScore, grade, summary, totalFiles);
  
  // Generate top risks
  const topRisks = generateTopRisks(productionIssues, summary);

  return {
    overallScore,
    grade,
    issues,
    summary,
    categoryBreakdown,
    explanation,
    topRisks,
  };
}

/**
 * Generate category breakdown
 */
function generateCategoryBreakdown(issues: SecurityIssue[]): Array<{
  category: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}> {
  const categoryMap = new Map<string, { count: number; maxSeverity: string; types: Set<string> }>();

  for (const issue of issues) {
    const existing = categoryMap.get(issue.category);
    if (existing) {
      existing.count++;
      existing.types.add(issue.type);
      // Update max severity
      if (SEVERITY_ORDER.indexOf(issue.type) < SEVERITY_ORDER.indexOf(existing.maxSeverity as typeof SEVERITY_ORDER[number])) {
        existing.maxSeverity = issue.type;
      }
    } else {
      categoryMap.set(issue.category, {
        count: 1,
        maxSeverity: issue.type,
        types: new Set([issue.type]),
      });
    }
  }

  const descriptions: Record<string, string> = {
    'Code Injection': 'eval()やFunction()などのコード実行機能の使用による任意コード実行のリスク',
    'XSS': 'クロスサイトスクリプティング攻撃の可能性があるDOM操作',
    'SQL Injection': 'SQLインジェクション攻撃のリスクがある動的クエリ生成',
    'Command Injection': 'シェルコマンドインジェクションのリスク',
    'Hardcoded Secrets': '認証情報や秘密鍵のハードコーディング',
    'Weak Cryptography': '脆弱な暗号化アルゴリズムの使用',
    'Weak Randomness': 'セキュリティ用途に不適切な乱数生成',
    'Input Validation': 'ユーザー入力の不適切な検証',
    'Insecure Deserialization': '安全でないデシリアライゼーション',
    'Environment Variables': '環境変数の使用（適切な管理が必要）',
  };

  return Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      severity: data.maxSeverity as 'critical' | 'high' | 'medium' | 'low',
      description: descriptions[category] || 'セキュリティ上の懸念事項',
    }))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

/**
 * Generate explanation based on score and issues
 */
function generateExplanation(
  score: number,
  grade: string,
  summary: SecurityScore['summary'],
  totalFiles: number
): string {
  const total = summary.critical + summary.high + summary.medium + summary.low + summary.info;
  const title = `セキュリティスコア${score}点（グレード${grade}）: `;
  if (totalFiles === 0) return title + '解析対象ファイルがありません。安全性は評価できません。';
  if (total === 0) return title + '検出ルールに該当する指摘はありません。安全性を保証するものではありません。';
  const counts = `指摘${total}件（Critical: ${summary.critical}件、High: ${summary.high}件、Medium: ${summary.medium}件、Low: ${summary.low}件、Info: ${summary.info}件）。`;
  const action = summary.critical > 0
    ? 'Criticalの指摘を優先して確認してください。'
    : summary.high > 0
      ? 'Highの指摘を優先して確認してください。'
      : '各指摘の影響と対応の必要性を確認してください。';
  const verifyAndCaps = `静的検出による候補のため、実コードで確認が必要です。採点上限はCriticalあり${SEVERITY_SCORE_CAPS.critical}点、Highあり${SEVERITY_SCORE_CAPS.high}点、Mediumあり${SEVERITY_SCORE_CAPS.medium}点、その他の指摘あり${SEVERITY_SCORE_CAPS.other}点です。`;
  return title + counts + action + verifyAndCaps;
}

/**
 * Generate top risks summary
 */
function generateTopRisks(issues: SecurityIssue[], summary: SecurityScore['summary']): string[] {
  const risks: string[] = [];

  // Critical issues
  const criticalIssues = issues.filter((i) => i.type === 'critical');
  if (criticalIssues.length > 0) {
    const categories = [...new Set(criticalIssues.map((i) => i.category))];
    risks.push(`${summary.critical}件のクリティカルな脆弱性: ${categories.join(', ')}`);
  }

  // High severity issues
  const highIssues = issues.filter((i) => i.type === 'high');
  if (highIssues.length > 0) {
    const categories = [...new Set(highIssues.map((i) => i.category))];
    risks.push(`${summary.high}件の高リスク問題: ${categories.join(', ')}`);
  }

  // Count by category
  const categoryCount = new Map<string, number>();
  for (const issue of issues) {
    if (issue.type === 'critical' || issue.type === 'high') {
      categoryCount.set(issue.category, (categoryCount.get(issue.category) || 0) + 1);
    }
  }

  const topCategories = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_RISK_CATEGORY_LIMIT);

  if (topCategories.length > 0) {
    risks.push(
      `最も多い問題カテゴリ: ${topCategories.map(([cat, count]) => `${cat}（${count}件）`).join(', ')}`
    );
  }

  // Files with most issues
  const fileCount = new Map<string, number>();
  for (const issue of issues) {
    if (issue.type === 'critical' || issue.type === 'high') {
      const fileName = path.basename(issue.filePath);
      fileCount.set(fileName, (fileCount.get(fileName) || 0) + 1);
    }
  }

  const topFiles = Array.from(fileCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_RISK_FILE_LIMIT);

  if (topFiles.length > 0) {
    risks.push(
      `問題が多いファイル: ${topFiles.map(([file, count]) => `${file}（${count}件）`).join(', ')}`
    );
  }

  if (risks.length === 0) {
    risks.push('深刻なセキュリティリスクは検出されませんでした');
  }

  return risks;
}

/** Categories whose patterns match a call; a call made only with literal arguments is not reported. */
const CALL_CATEGORIES = new Set(['Command Injection']);

/**
 * Scan a batch of files (one language) for security issues, appending results into `issues`.
 * `fileInfo.filePath` is already absolute (fileWalker returns absolute paths),
 * so it's used as-is rather than re-joined with repoPath — path.join would silently
 * produce a non-existent path if given an absolute second argument, making every
 * file in the batch fail to read and be skipped without surfacing an error.
 */
async function scanFiles(
  files: ReadonlyArray<{ filePath: string }>,
  repoPath: string,
  language: SecurityLanguage,
  issues: SecurityIssue[]
): Promise<void> {
  for (const fileInfo of files) {
    const fullPath = path.isAbsolute(fileInfo.filePath)
      ? fileInfo.filePath
      : path.join(repoPath, fileInfo.filePath);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue; // Skip files that can't be read
    }
    const inTest = isTestPath(path.relative(repoPath, fullPath));
    issues.push(...(await scanFileForIssues(content, fileInfo.filePath, language)).map((issue) => ({ ...issue, inTest })));
  }
}

/** Syntax facts that rule matches out: literal/comment text, and calls made only with constants. */
async function evidenceFor(content: string, language: SecurityLanguage): Promise<SecurityEvidence> {
  if (language === 'typescript') return { textRanges: securityIgnoredRanges(content), literalCallParens: new Set() };
  const spec = (SYNTAX_SPECS as Partial<Record<SecurityLanguage, LanguageSyntaxSpec>>)[language];
  if (!spec) return { textRanges: [], literalCallParens: new Set() };
  try {
    return await securityEvidence(spec, content);
  } catch {
    return { textRanges: [], literalCallParens: new Set() };
  }
}

/**
 * Scan a single file for security issues
 */
async function scanFileForIssues(
  content: string,
  filePath: string,
  language: SecurityLanguage
): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];
  const patterns = SECURITY_PATTERNS[language];
  const lines = content.split('\n');
  const evidence = await evidenceFor(content, language);
  const flows = await flowsFor(content, language, filePath);
  // TypeScript ranges come from the compiler: a match starting inside one is text. Tree-sitter
  // ranges must contain the whole match, so patterns spanning a string boundary still count.
  const isText = (start: number, end: number) => language === 'typescript'
    ? evidence.textRanges.some(([from, to]) => start >= from && start < to)
    : evidence.textRanges.some(([from, to]) => start >= from && end <= to);

  for (const patternDef of patterns) {
    const matches = content.matchAll(patternDef.pattern);

    for (const match of matches) {
      if (isText(match.index, match.index + match[0].length)) continue;
      if (CALL_CATEGORIES.has(patternDef.category) && evidence.literalCallParens.has(match.index + match[0].lastIndexOf('('))) continue;
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      // Skip if it's in a comment
      const lineContent = lines[lineNumber - 1];
      if (isInComment(lineContent, language)) {
        continue;
      }

      const finding: SecurityIssue = {
        type: patternDef.type,
        category: patternDef.category,
        description: patternDef.description,
        filePath,
        lineNumber,
        recommendation: patternDef.recommendation,
      };
      // Without flow analysis (unsupported language or a parse failure) the pattern stands as is.
      const issue = flows === null ? finding : reconcilePatternIssue(finding, flows);
      if (issue) issues.push(issue);
    }
  }

  return [...flowIssues(flows ?? [], filePath), ...issues];
}

/** Data flows from untrusted input to dangerous calls, or null when flows are not analyzed. */
async function flowsFor(content: string, language: SecurityLanguage, filePath: string): Promise<DataFlow[] | null> {
  const grammar = flowGrammarFor(language, filePath);
  if (!grammar) return null;
  try {
    return await analyzeFlows(grammar, content);
  } catch {
    return null;
  }
}

/**
 * Check if a line is a comment
 */
function isInComment(line: string, language: SecurityLanguage): boolean {
  const trimmed = line.trim();

  if (language === 'typescript') {
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }
  if (language === 'python') {
    return trimmed.startsWith('#');
  }
  return trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*');
}

/**
 * Calculate overall security score
 */
function calculateScore(
  summary: SecurityScore['summary'],
  totalFiles: number
): number {
  if (totalFiles === 0) return PERFECT_SCORE;

  // Total issues detected
  const totalIssues = summary.critical + summary.high + summary.medium + summary.low + summary.info;

  // If no issues detected, return perfect score
  if (totalIssues === 0) return PERFECT_SCORE;

  // Weighted penalty for each severity level
  const penalty =
    summary.critical * SEVERITY_PENALTY_WEIGHTS.critical +
    summary.high * SEVERITY_PENALTY_WEIGHTS.high +
    summary.medium * SEVERITY_PENALTY_WEIGHTS.medium +
    summary.low * SEVERITY_PENALTY_WEIGHTS.low +
    summary.info * SEVERITY_PENALTY_WEIGHTS.info;

  // Normalize by file count and issue density
  // Prevents artificial inflation for projects with few files
  const issueIntensity = totalIssues / totalFiles;
  const normalizedPenalty = Math.min(PERFECT_SCORE, (penalty * Math.log(issueIntensity + 1)) / PENALTY_LOG_SCALE_DIVISOR);
  const score = Math.max(0, PERFECT_SCORE - normalizedPenalty);

  return Math.min(Math.round(score), severityScoreCap(summary));
}

function severityScoreCap(summary: SecurityScore['summary']): number {
  if (summary.critical > 0) return SEVERITY_SCORE_CAPS.critical;
  if (summary.high > 0) return SEVERITY_SCORE_CAPS.high;
  if (summary.medium > 0) return SEVERITY_SCORE_CAPS.medium;
  return SEVERITY_SCORE_CAPS.other;
}
