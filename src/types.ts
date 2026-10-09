import type { AppConfig } from './config';

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
 * Dart Analysis Types (lightweight)
 */

export interface DartFunctionInfo {
  name: string;
  lineCount: number;
  paramCount: number;
}

export interface DartClassInfo {
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

export interface DartFileInfo {
  filePath: string;
  classes: DartClassInfo[];
  functions: DartFunctionInfo[];
  imports: string[];
  lineCount: number;
  dependencies: string[];
}

/**
 * Python Analysis Types (lightweight, indentation-based)
 */

export interface PythonFunctionInfo {
  name: string;
  lineCount: number;
  paramCount: number;
}

export interface PythonClassInfo {
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

export interface PythonFileInfo {
  filePath: string;
  classes: PythonClassInfo[];
  functions: PythonFunctionInfo[];
  imports: string[];
  lineCount: number;
  dependencies: string[];
}

/**
 * Language Detection Types
 */

export type AnalysisLanguage = 'typescript' | 'javascript' | 'php' | 'dart' | 'python' | 'auto';

export interface DetectionResult {
  hasTypeScript: boolean;
  hasJavaScript: boolean;
  hasPHP: boolean;
  hasDart: boolean;
  hasPython: boolean;
  fileCount: {
    ts: number;
    js: number;
    php: number;
    dart: number;
    python: number;
    total: number;
  };
  primaryLanguage: 'typescript' | 'javascript' | 'php' | 'dart' | 'python' | 'mixed' | 'unknown';
}

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
    tsFiles: number;
    phpFiles: number;
    dartFiles: number;
    pythonFiles: number;
    totalClasses: number;
    totalMethods: number;
    avgGodScore: number;
  };
  godClasses: GodClassResult[];
  dependencyGraph: string;
  callGraph: CallGraph;
  callGraphMermaid: string;
  tsFiles: FileInfo[];
  phpFiles: PHPFileInfo[];
  dartFiles: DartFileInfo[];
  pythonFiles: PythonFileInfo[];
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
