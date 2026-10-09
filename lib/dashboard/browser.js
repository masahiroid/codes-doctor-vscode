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
    document.querySelectorAll('li[data-analysis-id]').forEach((row) => {
        row.addEventListener('click', () => {
            vscode.postMessage({ type: 'openReportFromHistory', analysisId: row.getAttribute('data-analysis-id') });
        });
    });
}
