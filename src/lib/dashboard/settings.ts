import { getReportOpenMode, getAnalysisLanguage, getLlmProvider, getLlmOutputMode, getDisplayLanguage } from '../config';
import { setting } from '../settingsSchema';

type EnumSettingKey = 'reportOpenMode' | 'analysisLanguage' | 'llmProvider' | 'llmOutputMode' | 'displayLanguage';

/** Dashboard wording for each enum value; the values themselves come from package.json. */
const OPTION_LABELS: Record<EnumSettingKey, Record<string, string>> = {
  reportOpenMode: { external: 'External Browser', webview: 'VS Code WebView', vscode: 'VS Code URI Open' },
  analysisLanguage: {
    auto: 'Auto Detect (recommended)',
    typescript: 'TypeScript/JavaScript',
    javascript: 'JavaScript only',
    php: 'PHP',
    dart: 'Dart',
    python: 'Python',
    go: 'Go',
    swift: 'Swift',
    csharp: 'C#',
    java: 'Java',
    kotlin: 'Kotlin',
    rust: 'Rust',
    cpp: 'C++',
  },
  llmProvider: { openai: 'OpenAI', anthropic: 'Anthropic (Claude)' },
  llmOutputMode: { review: 'Review report', agentPrompt: 'AI coding agent prompt' },
  displayLanguage: { en: 'English', ja: '日本語' },
};

/** Options for an enum setting, in manifest order. A manifest value without a label is a build-time error. */
export function enumOptions(key: EnumSettingKey): ReadonlyArray<{ value: string; label: string }> {
  return (setting(key).enum ?? []).map((value) => {
    const label = OPTION_LABELS[key][value];
    if (!label) throw new Error(`Missing dashboard label for codeDoctor.${key} = ${value}`);
    return { value, label };
  });
}

/** Dashboard <select> elements that map 1:1 to a `codeDoctor.*` setting. */
export interface SettingsField {
  id: string;
  settingKey: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  getCurrent(vscode: typeof import('vscode')): string;
}
export const SETTINGS_FIELDS: readonly SettingsField[] = [
  { id: 'reportOpenMode', settingKey: 'reportOpenMode', options: enumOptions('reportOpenMode'), getCurrent: getReportOpenMode },
  { id: 'analysisLanguage', settingKey: 'analysisLanguage', options: enumOptions('analysisLanguage'), getCurrent: getAnalysisLanguage },
  { id: 'llmProvider', settingKey: 'llmProvider', options: enumOptions('llmProvider'), getCurrent: getLlmProvider },
  { id: 'llmOutputMode', settingKey: 'llmOutputMode', options: enumOptions('llmOutputMode'), getCurrent: getLlmOutputMode },
  { id: 'displayLanguage', settingKey: 'displayLanguage', options: enumOptions('displayLanguage'), getCurrent: getDisplayLanguage }
];


module.exports = { SETTINGS_FIELDS, enumOptions };
