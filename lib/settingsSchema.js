"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DASHBOARD_VIEW_ID = exports.COMMANDS = exports.REPORT_STORAGE = exports.LLM_DEFAULTS = exports.TOKEN_LIMITS = exports.CONFIGURATION_SECTION = exports.PRODUCT_NAME = exports.EXTENSION_VERSION = void 0;
exports.setting = setting;
exports.isValidTokenLimit = isValidTokenLimit;
const manifest = require('../package.json');
exports.EXTENSION_VERSION = manifest.version;
exports.PRODUCT_NAME = manifest.displayName;
exports.CONFIGURATION_SECTION = 'codeDoctor';
const properties = manifest.contributes.configuration.properties;
function setting(key) {
    return properties[`${exports.CONFIGURATION_SECTION}.${key}`];
}
exports.TOKEN_LIMITS = Object.freeze({
    minimum: setting('llmMaxOutputTokens').minimum,
    maximum: setting('llmMaxOutputTokens').maximum,
    defaultValue: setting('llmMaxOutputTokens').default,
});
function isValidTokenLimit(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= exports.TOKEN_LIMITS.minimum && value <= exports.TOKEN_LIMITS.maximum;
}
exports.LLM_DEFAULTS = Object.freeze({ fullReviewTokens: 3000, astReviewTokens: 4000, temperature: 0.2 });
exports.REPORT_STORAGE = Object.freeze({ directory: 'reports' });
exports.COMMANDS = Object.freeze(Object.fromEntries(manifest.contributes.commands.map(({ command }) => [command.slice(exports.CONFIGURATION_SECTION.length + 1), command])));
exports.DASHBOARD_VIEW_ID = manifest.contributes.views[exports.CONFIGURATION_SECTION][0].id;
module.exports = { EXTENSION_VERSION: exports.EXTENSION_VERSION, PRODUCT_NAME: exports.PRODUCT_NAME, CONFIGURATION_SECTION: exports.CONFIGURATION_SECTION, setting, TOKEN_LIMITS: exports.TOKEN_LIMITS, isValidTokenLimit, LLM_DEFAULTS: exports.LLM_DEFAULTS, REPORT_STORAGE: exports.REPORT_STORAGE, COMMANDS: exports.COMMANDS, DASHBOARD_VIEW_ID: exports.DASHBOARD_VIEW_ID };
