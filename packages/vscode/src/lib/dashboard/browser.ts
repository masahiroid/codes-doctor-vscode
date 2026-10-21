declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(state: unknown): void };
export function installDashboardControls(setApiKeyCommand: string): void {
    const vscode = acquireVsCodeApi();

    document.querySelectorAll<HTMLButtonElement>('button[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        const command = button.getAttribute('data-command');
        if (!command) return;
        button.blur();
        vscode.postMessage({ type: 'command', command });
      });
    });

    document.querySelectorAll<HTMLSelectElement>('select[data-setting-key]').forEach((select) => {
      select.addEventListener('change', (event) => {
        vscode.postMessage({
          type: 'setSetting',
          key: select.getAttribute('data-setting-key'),
          value: select.value,
        });
      });
    });

    const tokenInput = document.querySelector<HTMLInputElement>('#llmMaxOutputTokens');
    if (tokenInput) tokenInput.addEventListener('change', () => {
      if (tokenInput.value.trim() && tokenInput.checkValidity()) {
        vscode.postMessage({ type: 'setLlmMaxOutputTokens', value: Number(tokenInput.value) });
      }
    });

    const modelSelect = document.querySelector<HTMLSelectElement>('select[data-model-select]');
    if (modelSelect) {
      modelSelect.addEventListener('change', (event) => {
        vscode.postMessage({ type: 'setLlmModel', value: modelSelect.value });
      });
    }

    const setApiKeyBtn = document.querySelector('button[data-action="setApiKey"]');
    if (setApiKeyBtn) {
      setApiKeyBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'command', command: setApiKeyCommand });
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

    document.querySelectorAll<HTMLInputElement>('input[data-security-pack]').forEach((box) => {
      box.addEventListener('change', () => {
        vscode.postMessage({ type: 'toggleSecurityPack', packId: box.getAttribute('data-security-pack'), enabled: box.checked });
      });
    });

    document.querySelectorAll<HTMLElement>('[data-security-file]').forEach((link) => {
      link.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSecurityLocation', file: link.getAttribute('data-security-file'), line: Number(link.getAttribute('data-security-line')) });
      });
    });

    // The panel is redrawn after every state change, so open sections are remembered in the webview state.
    const saved = (vscode.getState() as { open?: Record<string, boolean> } | undefined)?.open ?? {};
    document.querySelectorAll<HTMLDetailsElement>('details[data-section]').forEach((section) => {
      const key = section.getAttribute('data-section') ?? '';
      if (key in saved) section.open = saved[key];
      section.addEventListener('toggle', () => {
        const open = (vscode.getState() as { open?: Record<string, boolean> } | undefined)?.open ?? {};
        vscode.setState({ open: { ...open, [key]: section.open } });
      });
    });

    document.querySelectorAll('li[data-analysis-id]').forEach((row) => {
      row.addEventListener('click', () => {
        vscode.postMessage({ type: 'openReportFromHistory', analysisId: row.getAttribute('data-analysis-id') });
      });
    });
}
