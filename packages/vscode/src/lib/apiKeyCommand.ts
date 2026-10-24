import { translator } from './i18n';
import { getLlmProvider } from './config';
import { setApiKey } from './secrets';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  'vscode-lm': 'VS Code Built-in AI',
};

/**
 * Ask for the API key of the configured LLM provider and keep it in VS Code's secret storage.
 * An empty key clears the stored one; cancelling the prompt changes nothing. The built-in
 * provider (vscode.lm) needs no key.
 */
export async function promptForLlmApiKey(vscode: typeof import('vscode'), context: import('vscode').ExtensionContext) {
  const t = translator(vscode);
  const provider = getLlmProvider(vscode);
  if (provider === 'vscode-lm') {
    vscode.window.showInformationMessage(
      t('VS Code Built-in AI (vscode.lm) uses your signed-in editor account (such as GitHub Copilot) and does not require an API key.')
    );
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

  await setApiKey(context, provider, apiKey.trim());
  if (apiKey.trim()) {
    vscode.window.showInformationMessage(t('{provider} API key saved.', { provider: providerLabel }));
  } else {
    vscode.window.showInformationMessage(t('{provider} API key cleared.', { provider: providerLabel }));
  }
}

module.exports = {
  promptForLlmApiKey,
};
