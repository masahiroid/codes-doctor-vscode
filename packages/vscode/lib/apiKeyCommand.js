"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promptForLlmApiKey = promptForLlmApiKey;
const i18n_1 = require("./i18n");
const config_1 = require("./config");
const secrets_1 = require("./secrets");
const PROVIDER_LABELS = {
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
    'vscode-lm': 'VS Code Built-in AI',
};
/**
 * Ask for the API key of the configured LLM provider and keep it in VS Code's secret storage.
 * An empty key clears the stored one; cancelling the prompt changes nothing. The built-in
 * provider (vscode.lm) needs no key.
 */
async function promptForLlmApiKey(vscode, context) {
    const t = (0, i18n_1.translator)(vscode);
    const provider = (0, config_1.getLlmProvider)(vscode);
    if (provider === 'vscode-lm') {
        vscode.window.showInformationMessage(t('VS Code Built-in AI (vscode.lm) uses your signed-in editor account (such as GitHub Copilot) and does not require an API key.'));
        return;
    }
    const providerLabel = PROVIDER_LABELS[provider] || provider;
    const apiKey = await vscode.window.showInputBox({
        title: t('Set {provider} API Key', { provider: providerLabel }),
        prompt: t("Enter your {provider} API key. It is stored securely in VS Code's secret storage (not in settings.json).", { provider: providerLabel }),
        password: true,
        ignoreFocusOut: true,
        placeHolder: provider === 'anthropic' ? 'sk-ant-...' : 'sk-...',
    });
    if (apiKey === undefined) {
        return;
    }
    await (0, secrets_1.setApiKey)(context, provider, apiKey.trim());
    if (apiKey.trim()) {
        vscode.window.showInformationMessage(t('{provider} API key saved.', { provider: providerLabel }));
    }
    else {
        vscode.window.showInformationMessage(t('{provider} API key cleared.', { provider: providerLabel }));
    }
}
module.exports = {
    promptForLlmApiKey,
};
