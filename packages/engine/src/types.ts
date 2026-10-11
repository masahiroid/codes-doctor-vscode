import type { AppConfig } from './config';
import type { SourceLanguageId } from './analyzer/languages/catalog';

/**
 * TypeScript/JavaScript AST Analysis Types
 */

export interface FunctionInfo {
  name: string;
  lineCount: number;
  paramCount: number;
}

export interface ClassInfo {
  name: string;
  filePath: string;
  lineCount: number;
  methodCount: number;
  propertyCount: number;
  importCount: number;
  constructorExists: boolean;
  methods: string[];
  dependencies: string[];
}

export interface FileInfo {
  filePath: string;
  classes: ClassInfo[];
  functions: FunctionInfo[];
  imports: string[];
  lineCount: number;
}

/**
 * PHP AST Analysis Types
 */

export interface PHPClassInfo {
  name: string;
  filePath: string;
  lineCount: number;
  methodCount: number;
  propertyCount: number;
  useCount: number;
  methods: string[];
  namespace: string | null;
  dependencies: string[];
}

export interface PHPFileInfo {
  filePath: string;
  classes: PHPClassInfo[];
  functions: { name: string; lineCount: number }[];
  lineCount: number;
  dependencies: string[]; // PHP use statements
}

/**
 * Lightweight (regex-based) parser output, shared by every language that is not
 * parsed with a full AST (Dart, Python, Go, Swift, C#, Java, Kotlin, Rust, C++).
 */
export interface SimpleFunctionInfo {
  name: string;
  lineCount: number;
  paramCount: number;
}

export interface SimpleClassInfo {
  name: string;
  filePath: string;
  lineCount: number;
  methodCount: number;
  propertyCount: number;
  importCount: number;
  constructorExists: boolean;
  methods: string[];
  dependencies: string[];
}

export interface SimpleFileInfo {
  filePath: string;
  classes: SimpleClassInfo[];
  functions: SimpleFunctionInfo[];
  imports: string[];
  lineCount: number;
  dependencies: string[];
}

/**
 * Language Detection Types
 */

export type { AnalysisLanguage } from './analyzer/languages/catalog';

export interface DetectionResult {
  /** Files found per source language (before any forced-language override). */
  fileCounts: Record<SourceLanguageId, number>;
  totalFiles: number;
  /** Source languages that will be analyzed (all detected ones, or only the forced mode's). */
  enabled: Record<SourceLanguageId, boolean>;
  primaryLanguage: SourceLanguageId | 'mixed' | 'unknown';
}

/** Parse results per analysis language; keys are `LanguageId`s from the language catalog. */
export interface LanguageFileMap {
  typescript: FileInfo[];
  php: PHPFileInfo[];
  dart: SimpleFileInfo[];
  python: SimpleFileInfo[];
  go: SimpleFileInfo[];
  swift: SimpleFileInfo[];
  csharp: SimpleFileInfo[];
  java: SimpleFileInfo[];
  kotlin: SimpleFileInfo[];
  rust: SimpleFileInfo[];
  cpp: SimpleFileInfo[];
}

/** A parsed file of any language. */
export type ParsedFile = LanguageFileMap[keyof LanguageFileMap][number];

/**
 * God Class Scoring Types
 */

export interface GodClassResult {
  className: string;
  filePath: string;
  methodCount: number;
  lineCount: number;
  importCount: number;
  propertyCount: number;
  godScore: number;
  rank: 'critical' | 'high' | 'medium' | 'low';
  warnings: string[];
  cyclomaticComplexity?: number; // Average CC for the class (optional, calculated separately)
}

/**
 * Call Graph Types
 */

export interface CallEdge {
  from: string;
  to: string;
  filePath: string;
}

export interface CallGraph {
  edges: CallEdge[];
  nodes: string[];
}

/**
 * Module Metrics Types
 */

export interface ModuleMetrics {
  moduleName: string;
  filePath: string;
  lineCount: number;
  fanIn: number; // このモジュールに依存しているモジュール数
  fanOut: number; // このモジュールが依存しているモジュール数
  instability: number; // I = fanOut / (fanIn + fanOut)
  centrality: number; // Degree centrality (0-1)
  structuralScore: number; // 0-100 composite score
}

export interface CircularDependency {
  cycle: string[];
  length: number;
}

/**
 * Technical Debt Score Types
 */

export interface TechnicalDebtMetricDetail {
  score: number;
  explanation: string;
  problems: string[];
  goodPoints: string[];
  includedInOverall?: boolean;
  measurementStatus?: 'measured' | 'placeholder';
}

export interface TechnicalDebtScore {
  overallScore: number; // 0-100 (higher is better)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: {
    codeComplexity: number; // Based on God Classes
    maintainability: number; // Based on module metrics
    circularDeps: number; // Based on circular dependencies
    testCoverage?: number; // Reserved for future implementation
    documentation?: number; // Reserved for future implementation
  };
  metricsDetail: {
    codeComplexity: TechnicalDebtMetricDetail;
    maintainability: TechnicalDebtMetricDetail;
    circularDeps: TechnicalDebtMetricDetail;
    testCoverage?: TechnicalDebtMetricDetail;
    documentation?: TechnicalDebtMetricDetail;
  };
  issues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recommendations: string[];
  summary: string;
}

/**
 * Security Score Types
 */

export interface SecurityIssue {
  type: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  recommendation: string;
  codeSnippet?: string;
  /** Found in test code: listed, but not counted in the score. */
  inTest?: boolean;
  /** `flow`: untrusted input was traced to this line; `pattern`: only the code pattern matched. */
  confidence?: 'flow' | 'pattern';
  /** The traced path, for `flow` findings. */
  flow?: {
    source: { line: number; code: string };
    steps: Array<{ line: number; code: string }>;
    sink: { line: number; code: string };
  };
}

export interface SecurityCategoryDetail {
  category: string;
  count: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface SecurityScore {
  overallScore: number; // 0-100 (higher is better)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: SecurityIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  categoryBreakdown: SecurityCategoryDetail[];
  explanation: string;
  topRisks: string[];
}

/**
 * Layer Analysis Types
 */

export interface LayerInfo {
  name: string;
  fileCount: number;
  classCount: number;
  avgComplexity: number;
  dependencies: string[]; // Other layers this depends on
}

export interface LayerHeatmap {
  layers: LayerInfo[];
  matrix: number[][]; // Dependency matrix
}

/**
 * SBOM (Software Bill of Materials) Types
 */

export interface SBOMComponent {
  name: string;
  version: string;
  type: 'library' | 'application' | 'framework';
  purl: string; // Package URL
  isDev?: boolean;
  isTransitive?: boolean;
}

export interface SBOMDependency {
  name: string;
  dependsOn: string;
  version: string;
}

export interface SBOM {
  version: string;
  format: 'CycloneDX' | 'SPDX';
  components: SBOMComponent[];
  dependencies: SBOMDependency[];
  metadata: {
    timestamp: string;
    projectName?: string;
    projectVersion?: string;
    toolName?: string;
    toolVersion?: string;
    trivyVersion?: string;
  };
}

/**
 * Vulnerability Scan Types
 */

export interface VulnerabilityInfo {
  packageName: string;
  packagePath: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  affectedRange: string;
  cwe: string[];
  cvss?: number;
  proposedFix: string;
  fixable: boolean;
  reference: string;
  // Trivy specific fields
  currentVersion?: string;
  fixedVersions?: string;
  cveId?: string;
  url?: string;
}

export interface VulnerabilityScan {
  timestamp: string;
  source: 'npm-audit' | 'trivy' | 'snyk' | 'custom';
  totalVulnerabilities: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  vulnerabilities: VulnerabilityInfo[];
  fixable: number;
  summary: string;
}

/**
 * Analysis Result Types
 */


export interface AnalysisResult {
  analysisId: string;
  repoPath: string;
  analyzedAt: string;
  summary: {
    totalFiles: number;
    totalClasses: number;
    totalMethods: number;
    avgGodScore: number;
  };
  godClasses: GodClassResult[];
  dependencyGraph: string;
  callGraph: CallGraph;
  callGraphMermaid: string;
  files: LanguageFileMap;
  detectedLanguages: DetectionResult;
  moduleMetrics: ModuleMetrics[];
  circularDependencies: CircularDependency[];
  technicalDebt?: TechnicalDebtScore;
  securityScore?: SecurityScore;
  layerHeatmap?: LayerHeatmap;
  sbom?: SBOM;
  vulnerabilityScan?: VulnerabilityScan;
  config: AppConfig;
}

// Re-export AppConfig for convenience
export type { AppConfig } from './config';
