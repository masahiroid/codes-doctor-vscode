"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installDashboardControls = installDashboardControls;
function installDashboardControls(setApiKeyCommand) {
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-command]').forEach((button) => {
        button.addEventListener('click', () => {
            const command = button.getAttribute('data-command');
            if (!command)
                return;
            button.blur();
            vscode.postMessage({ type: 'command', command });
        });
    });
    document.querySelectorAll('select[data-setting-key]').forEach((select) => {
        select.addEventListener('change', (event) => {
            vscode.postMessage({
                type: 'setSetting',
                key: select.getAttribute('data-setting-key'),
                value: select.value,
            });
        });
    });
    const tokenInput = document.querySelector('#llmMaxOutputTokens');
    if (tokenInput)
        tokenInput.addEventListener('change', () => {
            if (tokenInput.value.trim() && tokenInput.checkValidity()) {
                vscode.postMessage({ type: 'setLlmMaxOutputTokens', value: Number(tokenInput.value) });
            }
        });
    const modelSelect = document.querySelector('select[data-model-select]');
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
    document.querySelectorAll('input[data-security-pack]').forEach((box) => {
        box.addEventListener('change', () => {
            vscode.postMessage({ type: 'toggleSecurityPack', packId: box.getAttribute('data-security-pack'), enabled: box.checked });
        });
    });
    document.querySelectorAll('[data-security-file]').forEach((link) => {
        link.addEventListener('click', () => {
            vscode.postMessage({ type: 'openSecurityLocation', file: link.getAttribute('data-security-file'), line: Number(link.getAttribute('data-security-line')) });
        });
    });
    // The panel is redrawn after every state change, so open sections are remembered in the webview state.
    const saved = vscode.getState()?.open ?? {};
    document.querySelectorAll('details[data-section]').forEach((section) => {
        const key = section.getAttribute('data-section') ?? '';
        if (key in saved)
            section.open = saved[key];
        section.addEventListener('toggle', () => {
            const open = vscode.getState()?.open ?? {};
            vscode.setState({ open: { ...open, [key]: section.open } });
        });
    });
    document.querySelectorAll('li[data-analysis-id]').forEach((row) => {
        row.addEventListener('click', () => {
            vscode.postMessage({ type: 'openReportFromHistory', analysisId: row.getAttribute('data-analysis-id') });
        });
    });
}
