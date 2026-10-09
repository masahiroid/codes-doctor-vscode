function getExtensionConfig(vscode) {
  return vscode.workspace.getConfiguration('codeDoctor');
}

function getReportOpenMode(vscode) {
  const config = getExtensionConfig(vscode);
  const mode = config.get('reportOpenMode', 'external');
  return typeof mode === 'string' ? mode : 'external';
}

function getAnalysisLanguage(vscode) {
  const config = getExtensionConfig(vscode);
  const language = config.get('analysisLanguage', 'auto');
  return typeof language === 'string' ? language : 'auto';
}

function getLlmProvider(vscode) {
  const config = getExtensionConfig(vscode);
  const provider = config.get('llmProvider', 'openai');
  return provider === 'anthropic' ? 'anthropic' : 'openai';
}

function getLlmModel(vscode) {
  const config = getExtensionConfig(vscode);
  const model = config.get('llmModel', '');
  return typeof model === 'string' ? model : '';
}

module.exports = {
  getExtensionConfig,
  getReportOpenMode,
  getAnalysisLanguage,
  getLlmProvider,
  getLlmModel,
};
