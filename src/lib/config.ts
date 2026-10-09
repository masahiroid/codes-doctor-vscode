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
  const language = config.inspect('displayLanguage')?.globalValue ?? config.get('displayLanguage', setting('displayLanguage').default);
  return language === 'ja' ? 'ja' : 'en';
}

export function getLlmProvider(vscode: typeof import('vscode')) {
  const config = getExtensionConfig(vscode);
  const provider = config.get('llmProvider', setting('llmProvider').default);
  return provider === 'anthropic' ? 'anthropic' : 'openai';
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

module.exports = {
  getLlmMaxOutputTokens,
  getExtensionConfig,
  getDisplayLanguage,
  getReportOpenMode,
  getAnalysisLanguage,
  getLlmProvider,
  getLlmModel,
};
