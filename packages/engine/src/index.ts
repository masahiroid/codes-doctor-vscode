/**
 * Public API of the Codes Doctor engine. Consumers (the VS Code extension, the CLI)
 * import from here rather than from internal module paths.
 */
export { analyzePathRequest, analyzeRepository } from './services/pathAnalysis';
export type { RepositoryAnalysis } from './services/pathAnalysis';
export { analyzeLlmRequest, getSavedLlmResult, listLlmModels } from './services/llmService';
export { runAnalysis } from './analyzer';
export { generateHTMLReport } from './report/htmlBuilder';
export type { ReportOptions } from './report/htmlBuilder';
export { getConfig, defaultConfig } from './config';
export type { AppConfig } from './config';
export { LLM_FOCUS } from './llm/focus';
export type { LlmMode } from './llm/focus';
export { ANALYSIS_LANGUAGES, AUTO_LANGUAGE, LANGUAGES, toAnalysisLanguage } from './analyzer/languages/catalog';
export type { AnalysisLanguage, LanguageId } from './analyzer/languages/catalog';
export type { AnalysisResult } from './types';
