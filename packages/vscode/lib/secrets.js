"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiKey = getApiKey;
exports.setApiKey = setApiKey;
/**
 * API keys are stored via VS Code's SecretStorage (context.secrets), which
 * uses the OS keychain — never in settings.json, which is plain text and
 * often synced/backed up. One secret per provider.
 */
const SECRET_KEY_PREFIX = 'codesDoctor.apiKey.';
function secretKeyFor(providerId) {
    return `${SECRET_KEY_PREFIX}${providerId}`;
}
async function getApiKey(context, providerId) {
    return context.secrets.get(secretKeyFor(providerId));
}
async function setApiKey(context, providerId, apiKey) {
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
