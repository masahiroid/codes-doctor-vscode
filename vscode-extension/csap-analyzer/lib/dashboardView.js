const { getExtensionConfig, getReportOpenMode, getAnalysisLanguage, getLlmProvider, getLlmModel } = require('./config');
const { getApiKey } = require('./secrets');
const { listModels, runLlmAnalysis } = require('./analyzer');
const { getLastAnalysis } = require('./lastAnalysisState');

const REPORT_OPEN_MODE_OPTIONS = [
  { value: 'external', label: 'External Browser' },
  { value: 'webview', label: 'VS Code WebView' },
  { value: 'vscode', label: 'VS Code URI Open' },
];

const ANALYSIS_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto Detect (recommended)' },
  { value: 'typescript', label: 'TypeScript/JavaScript' },
  { value: 'javascript', label: 'JavaScript only' },
  { value: 'php', label: 'PHP' },
  { value: 'dart', label: 'Dart' },
  { value: 'python', label: 'Python' },
];

const LLM_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
];

/** Dashboard <select> elements that map 1:1 to a `codeDoctor.*` setting. */
const SETTINGS_FIELDS = [
  { id: 'reportOpenMode', settingKey: 'reportOpenMode', options: REPORT_OPEN_MODE_OPTIONS, getCurrent: getReportOpenMode },
  { id: 'analysisLanguage', settingKey: 'analysisLanguage', options: ANALYSIS_LANGUAGE_OPTIONS, getCurrent: getAnalysisLanguage },
  { id: 'llmProvider', settingKey: 'llmProvider', options: LLM_PROVIDER_OPTIONS, getCurrent: getLlmProvider },
];

class CodeDoctorDashboardViewProvider {
  constructor(vscode, context) {
    this.vscode = vscode;
    this.context = context;
    this.currentView = null;
    /** Models fetched for the current provider, kept only in memory (not persisted). */
    this.fetchedModels = [];
    this.modelFetchError = null;
  }

  resolveWebviewView(webviewView) {
    this.currentView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));

    this.render();
  }

  async handleMessage(message) {
    if (!message?.type) return;

    if (message.type === 'command' && typeof message.command === 'string') {
      await this.vscode.commands.executeCommand(message.command);
      return;
    }

    if (message.type === 'setSetting' && typeof message.key === 'string' && typeof message.value === 'string') {
      const field = SETTINGS_FIELDS.find((f) => f.settingKey === message.key);
      if (!field) return;
      const config = getExtensionConfig(this.vscode);
      await config.update(field.settingKey, message.value, this.vscode.ConfigurationTarget.Global);
      if (field.settingKey === 'llmProvider') {
        // Switching provider invalidates the previously fetched model list.
        this.fetchedModels = [];
        this.modelFetchError = null;
      }
      this.render();
      return;
    }

    if (message.type === 'setLlmModel' && typeof message.value === 'string') {
      const config = getExtensionConfig(this.vscode);
      await config.update('llmModel', message.value, this.vscode.ConfigurationTarget.Global);
      this.render();
      return;
    }

    if (message.type === 'fetchModels') {
      await this.fetchModels();
      return;
    }

    if (message.type === 'runLlmAnalysis') {
      await this.runLlmAnalysis();
      return;
    }
  }

  async fetchModels() {
    const provider = getLlmProvider(this.vscode);
    const apiKey = await getApiKey(this.context, provider);
    if (!apiKey) {
      this.modelFetchError = `No API key set for ${provider}. Run "Codes Doctor: Set LLM API Key" first.`;
      this.fetchedModels = [];
      this.render();
      return;
    }

    this.modelFetchError = 'Fetching models...';
    this.render();

    try {
      this.fetchedModels = await listModels(provider, apiKey);
      this.modelFetchError = null;
    } catch (error) {
      this.fetchedModels = [];
      this.modelFetchError = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  async runLlmAnalysis() {
    const lastAnalysis = getLastAnalysis();
    if (!lastAnalysis) {
      this.vscode.window.showErrorMessage('Run "Analyze Current Workspace" first, then request an LLM review.');
      return;
    }

    const provider = getLlmProvider(this.vscode);
    const apiKey = await getApiKey(this.context, provider);
    if (!apiKey) {
      this.vscode.window.showErrorMessage(`No API key set for ${provider}. Run "Codes Doctor: Set LLM API Key" first.`);
      return;
    }

    const model = getLlmModel(this.vscode);

    await this.vscode.window.withProgress(
      {
        location: this.vscode.ProgressLocation.Notification,
        title: `Running LLM review (${provider})`,
        cancellable: false,
      },
      async () => {
        try {
          await runLlmAnalysis({
            analysisId: lastAnalysis.analysisId,
            outputDir: lastAnalysis.outputDir,
            provider,
            apiKey,
            model: model || undefined,
          });
          this.vscode.window.showInformationMessage('LLM review complete. Reopen the report to see it.');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.vscode.window.showErrorMessage(`LLM review failed: ${message}`);
        }
      }
    );
  }

  render() {
    if (!this.currentView) {
      return;
    }

    this.currentView.webview.html = this.buildHtml();
  }

  buildSelectField(field) {
    const currentValue = field.getCurrent(this.vscode);
    const options = field.options
      .map(
        ({ value, label }) =>
          `<option value="${value}"${value === currentValue ? ' selected' : ''}>${label}</option>`
      )
      .join('');
    return `<select id="${field.id}" data-setting-key="${field.settingKey}">${options}</select>`;
  }

  buildModelField() {
    const currentModel = getLlmModel(this.vscode);
    if (this.fetchedModels.length === 0) {
      return `<select id="llmModel" data-model-select disabled><option>— fetch models first —</option></select>`;
    }
    const options = this.fetchedModels
      .map(({ id, label }) => {
        const text = label ? `${label} (${id})` : id;
        return `<option value="${id}"${id === currentModel ? ' selected' : ''}>${text}</option>`;
      })
      .join('');
    return `<select id="llmModel" data-model-select>${options}</select>`;
  }

  buildHtml() {
    const escapedError = this.modelFetchError
      ? String(this.modelFetchError).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : '';

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
    }

    body {
      margin: 0;
      padding: 12px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
    }

    .card {
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
      background: var(--vscode-editor-background);
    }

    .card p {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.85;
      margin: 0;
    }

    .field-label {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.75;
      margin-bottom: 6px;
    }

    .field + .field {
      margin-top: 12px;
    }

    .field-row {
      display: flex;
      gap: 8px;
      align-items: stretch;
    }

    .field-row select {
      flex: 1;
    }

    .field-row button {
      width: auto;
      white-space: nowrap;
      padding: 8px 10px;
    }

    .note {
      font-size: 11px;
      opacity: 0.7;
      margin-top: 6px;
      line-height: 1.5;
    }

    .note.error {
      color: var(--vscode-errorForeground, #f14c4c);
      opacity: 1;
    }

    select {
      width: 100%;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-dropdown-background, var(--vscode-editor-background));
      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
      font-size: 12px;
    }

    select:disabled {
      opacity: 0.6;
    }

    button {
      appearance: none;
      width: 100%;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 10px;
      padding: 10px 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.08s ease, filter 0.12s ease, opacity 0.12s ease;
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.3);
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--vscode-button-background) 88%, white),
        var(--vscode-button-background)
      );
      color: var(--vscode-button-foreground);
    }

    button:hover {
      filter: brightness(1.06);
    }

    button:active {
      transform: translateY(1px) scale(0.99);
      filter: brightness(0.96);
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground, transparent);
      color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    }
  </style>
</head>
<body>
  <div class="card">
    <p>Codes Doctor analyzes the currently opened workspace folder and generates a structural diagnosis report (God Classes, technical debt, security score, dependency graphs, SBOM).</p>
  </div>

  <div class="card">
    <div class="field">
      <label class="field-label" for="analysisLanguage">Language Mode</label>
      ${this.buildSelectField(SETTINGS_FIELDS[1])}
    </div>
    <div class="field">
      <label class="field-label" for="reportOpenMode">Open Report Using</label>
      ${this.buildSelectField(SETTINGS_FIELDS[0])}
    </div>
  </div>

  <button data-command="codeDoctor.analyzeCurrentWorkspace">Analyze Current Workspace</button>

  <div class="card" style="margin-top: 12px;">
    <div class="field">
      <label class="field-label" for="llmProvider">LLM Provider</label>
      ${this.buildSelectField(SETTINGS_FIELDS[2])}
    </div>
    <div class="field">
      <button class="secondary" data-action="setApiKey">Set API Key</button>
    </div>
    <div class="field">
      <label class="field-label" for="llmModel">Model</label>
      <div class="field-row">
        ${this.buildModelField()}
        <button class="secondary" data-action="fetchModels">Fetch</button>
      </div>
      ${escapedError ? `<div class="note error">${escapedError}</div>` : ''}
    </div>
    <div class="field">
      <button data-action="runLlmAnalysis">Run LLM Review</button>
      <div class="note">Requires running "Analyze Current Workspace" first. Updates the generated report in place.</div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    document.querySelectorAll('button[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const command = button.getAttribute('data-command');
        if (!command) return;
        button.blur();
        vscode.postMessage({ type: 'command', command });
      });
    });

    document.querySelectorAll('select[data-setting-key]').forEach((select) => {
      select.addEventListener('change', (event) => {
        vscode.postMessage({
          type: 'setSetting',
          key: select.getAttribute('data-setting-key'),
          value: event.target.value,
        });
      });
    });

    const modelSelect = document.querySelector('select[data-model-select]');
    if (modelSelect) {
      modelSelect.addEventListener('change', (event) => {
        vscode.postMessage({ type: 'setLlmModel', value: event.target.value });
      });
    }

    const setApiKeyBtn = document.querySelector('button[data-action="setApiKey"]');
    if (setApiKeyBtn) {
      setApiKeyBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'command', command: 'codeDoctor.setLlmApiKey' });
      });
    }

    const fetchModelsBtn = document.querySelector('button[data-action="fetchModels"]');
    if (fetchModelsBtn) {
      fetchModelsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'fetchModels' });
      });
    }

    const runLlmBtn = document.querySelector('button[data-action="runLlmAnalysis"]');
    if (runLlmBtn) {
      runLlmBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runLlmAnalysis' });
      });
    }
  </script>
</body>
</html>`;
  }

  dispose() {}
}

module.exports = {
  CodeDoctorDashboardViewProvider,
};
