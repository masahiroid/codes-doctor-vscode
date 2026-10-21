/**
 * Public API of the Codes Doctor engine. Consumers (the VS Code extension, the CLI)
 * import from here rather than from internal module paths.
 */
export { analyzePathRequest, analyzeRepository } from './services/pathAnalysis';
export type { RepositoryAnalysis } from './services/pathAnalysis';
export {
  analyzeLlmRequest,
  buildLlmPromptMessages,
  getSavedLlmResult,
  listLlmModels,
  saveExternalLlmResult,
} from './services/llmService';
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
export { injectReviewCopy, isReviewTargetId, reviewCopySource } from './report/browser/reviewCopy';
export { injectReportTabs } from './report/browser/reportTabs';
export { injectTableFilter } from './report/browser/tableFilter';
export { reportLibraryScript } from './report/browser/libraries';
export type { ReportLibrary } from './report/browser/libraries';
export { BRAND_MARK_SVG, PRODUCT_NAME } from './report/branding';
export { compileTaintRule, analyzeTaintRule, analyzeTaintRules, taintRuleCovers } from './analyzer/flow/ruleTaint';
export type { CompiledTaintRule, TaintRuleDefinition } from './analyzer/flow/ruleTaint';
export type { DataFlow, FlowStep } from './analyzer/flow/taint';
export { isTestPath } from './analyzer/security/testCode';
