import type { ExtensionContext } from 'vscode';
import type { ReviewStatus } from '../types';

/** UI state and operations needed by workflows/renderers, independent of the provider class. */
export interface DashboardHost {
  vscode: typeof import('vscode');
  context: ExtensionContext;
  t(message: string, values?: Record<string, unknown>): string;
  extensionVersion: string;
  fetchedModels: Array<{ id: string; label?: string }>;
  modelFetchError: string | null;
  isRunningLlmAnalysis: boolean;
  llmAnalysisStatus: ReviewStatus | null;
  render(): void;
  fetchModels(): Promise<void>;
  runLlmAnalysis(): Promise<void>;
  openReportFromHistory(analysisId: string): Promise<void>;
}

export interface DashboardController extends DashboardHost {
  handleMessage(input: unknown): Promise<void>;
  buildHtml(): string;
}
