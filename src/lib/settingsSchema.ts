interface SettingValues {
  reportOpenMode: string;
  analysisLanguage: string;
  displayLanguage: string;
  llmProvider: string;
  llmModel: string;
  llmMaxOutputTokens: number;
}
type SettingDefinition<T> = { default: T } & (T extends number ? { minimum: number; maximum: number } : { enum?: string[] });
type ConfigurationProperties = {
  [K in keyof SettingValues as `codeDoctor.${K}`]: SettingDefinition<SettingValues[K]>;
};
interface ExtensionManifest {
  displayName: string;
  version: string;
  contributes: {
    configuration: { properties: ConfigurationProperties };
    commands: Array<{ command: string }>;
    views: { codeDoctor: Array<{ id: string }> };
  };
}
const manifest: ExtensionManifest = require('../package.json');

export const EXTENSION_VERSION: string = manifest.version;
export const PRODUCT_NAME: string = manifest.displayName;
export const CONFIGURATION_SECTION = 'codeDoctor';
const properties = manifest.contributes.configuration.properties;
export function setting(key: 'llmMaxOutputTokens'): SettingDefinition<number>;
export function setting(key: Exclude<keyof SettingValues, 'llmMaxOutputTokens'>): SettingDefinition<string>;
export function setting(key: keyof SettingValues): SettingDefinition<number> | SettingDefinition<string> {
  return properties[`${CONFIGURATION_SECTION}.${key}`];
}

export const TOKEN_LIMITS = Object.freeze({
  minimum: setting('llmMaxOutputTokens').minimum,
  maximum: setting('llmMaxOutputTokens').maximum,
  defaultValue: setting('llmMaxOutputTokens').default,
});
export function isValidTokenLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= TOKEN_LIMITS.minimum && value <= TOKEN_LIMITS.maximum;
}
export const LLM_DEFAULTS = Object.freeze({ fullReviewTokens: 3000, astReviewTokens: 4000, temperature: 0.2 });
export const REPORT_STORAGE = Object.freeze({ directory: 'reports' });
export const COMMANDS = Object.freeze(Object.fromEntries(manifest.contributes.commands.map(({ command }) => [command.slice(CONFIGURATION_SECTION.length + 1), command])));
export const DASHBOARD_VIEW_ID = manifest.contributes.views[CONFIGURATION_SECTION][0].id;
module.exports = { EXTENSION_VERSION, PRODUCT_NAME, CONFIGURATION_SECTION, setting, TOKEN_LIMITS, isValidTokenLimit, LLM_DEFAULTS, REPORT_STORAGE, COMMANDS, DASHBOARD_VIEW_ID };
