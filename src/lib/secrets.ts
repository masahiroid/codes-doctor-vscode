/**
 * API keys are stored via VS Code's SecretStorage (context.secrets), which
 * uses the OS keychain — never in settings.json, which is plain text and
 * often synced/backed up. One secret per provider.
 */
const SECRET_KEY_PREFIX = 'codesDoctor.apiKey.';

function secretKeyFor(providerId: 'openai' | 'anthropic') {
  return `${SECRET_KEY_PREFIX}${providerId}`;
}

export async function getApiKey(context: Pick<import('vscode').ExtensionContext, 'secrets'>, providerId: 'openai' | 'anthropic') {
  return context.secrets.get(secretKeyFor(providerId));
}

export async function setApiKey(context: Pick<import('vscode').ExtensionContext, 'secrets'>, providerId: 'openai' | 'anthropic', apiKey: string) {
  if (!apiKey) {
    await context.secrets.delete(secretKeyFor(providerId));
    return;
  }
  await context.secrets.store(secretKeyFor(providerId), apiKey);
}

module.exports = {
  getApiKey,
  setApiKey,
};
