import { CONFIGURATION_SECTION, setting, TOKEN_LIMITS, isValidTokenLimit } from './settingsSchema';
export function getExtensionConfig(vscode: typeof import('vscode')) {
  return vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
}

export function getReportOpenMode(vscode: typeof import('vscode')) {
  const config = getExtensionConfig(vscode);
  const mode = config.get('reportOpenMode', setting('reportOpenMode').default);
  return typeof mode === 'string' ? mode : setting('reportOpenMode').default;
}

export function getAnalysisLanguage(vscode: typeof import('vscode')) {
  const config = getExtensionConfig(vscode);
  const language = config.get('analysisLanguage', setting('analysisLanguage').default);
  return typeof language === 'string' ? language : setting('analysisLanguage').default;
}

export function getDisplayLanguage(vscode: typeof import('vscode')) {
  const config = getExtensionConfig(vscode);
  // The dashboard saves this application-wide preference in user settings.
  // Older workspace settings must not override the user's saved selection.
  const language = config.inspect?.('displayLanguage')?.globalValue ?? config.get('displayLanguage', setting('displayLanguage').default);
  return language === 'ja' ? 'ja' : 'en';
}

export function getLlmProvider(vscode: typeof import('vscode')) {
  const config = getExtensionConfig(vscode);
  const provider = config.get('llmProvider', setting('llmProvider').default);
  return provider === 'anthropic' ? 'anthropic' : 'openai';
}

export function getLlmOutputMode(vscode: typeof import('vscode')) {
  const mode = getExtensionConfig(vscode).get('llmOutputMode', setting('llmOutputMode').default);
  return mode === 'agentPrompt' ? 'agentPrompt' : 'review';
}

export function getLlmModel(vscode: typeof import('vscode')) {
  const config = getExtensionConfig(vscode);
  const model = config.get('llmModel', setting('llmModel').default);
  return typeof model === 'string' ? model : setting('llmModel').default;
}

export function getLlmMaxOutputTokens(vscode: typeof import('vscode')) {
  const value = getExtensionConfig(vscode).get('llmMaxOutputTokens', setting('llmMaxOutputTokens').default);
  return isValidTokenLimit(value) ? value : TOKEN_LIMITS.defaultValue;
}

export function getMinSecurity(vscode: typeof import('vscode')): number {
  const value = getExtensionConfig(vscode).get('minSecurity', setting('minSecurity').default);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
}

export function getMinTechnicalDebt(vscode: typeof import('vscode')): number {
  const value = getExtensionConfig(vscode).get('minTechnicalDebt', setting('minTechnicalDebt').default);
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
}

export function getCustomOutputDir(vscode: typeof import('vscode')): string {
  const value = getExtensionConfig(vscode).get('outputDirectory', setting('outputDirectory').default);
  return typeof value === 'string' ? value.trim() : '';
}

export function getAnalyzeOnSave(vscode: typeof import('vscode')): boolean {
  const value = getExtensionConfig(vscode).get('analyzeOnSave', setting('analyzeOnSave').default);
  return Boolean(value);
}

module.exports = {
  getLlmMaxOutputTokens,
  getExtensionConfig,
  getDisplayLanguage,
  getReportOpenMode,
  getAnalysisLanguage,
  getLlmProvider,
  getLlmOutputMode,
  getLlmModel,
  getMinSecurity,
  getMinTechnicalDebt,
  getCustomOutputDir,
  getAnalyzeOnSave,
};
