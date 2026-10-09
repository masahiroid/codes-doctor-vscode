export interface AnalysisReference {
  analysisId: string;
  outputDir: string;
  reportPath?: string;
}
export type ReviewStatus =
  | { kind: 'running' | 'done'; provider: string; model: string }
  | { kind: 'error'; message: string };
export interface LlmReviewRequest extends AnalysisReference {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  displayLanguage?: 'en' | 'ja';
  model?: string;
  astOnlyMode?: boolean;
  focus?: string;
  maxOutputTokens?: number;
  temperature?: number;
}
export interface ReportEntry {
  analysisId: string;
  reportPath: string;
  repoName?: string;
  analyzedAt?: string;
  mtimeMs: number;
}
export interface LlmHistoryEntry {
  focus: string;
  mode?: string;
  provider?: string;
  model?: string;
  createdAt?: string;
}
