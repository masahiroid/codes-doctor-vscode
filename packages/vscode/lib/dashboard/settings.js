"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTINGS_FIELDS = void 0;
exports.enumOptions = enumOptions;
const config_1 = require("../config");
const settingsSchema_1 = require("../settingsSchema");
/** Dashboard wording for each enum value; the values themselves come from package.json. */
const OPTION_LABELS = {
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
function enumOptions(key) {
    return ((0, settingsSchema_1.setting)(key).enum ?? []).map((value) => {
        const label = OPTION_LABELS[key][value];
        if (!label)
            throw new Error(`Missing dashboard label for codeDoctor.${key} = ${value}`);
        return { value, label };
    });
}
exports.SETTINGS_FIELDS = [
    { id: 'reportOpenMode', settingKey: 'reportOpenMode', options: enumOptions('reportOpenMode'), getCurrent: config_1.getReportOpenMode },
    { id: 'analysisLanguage', settingKey: 'analysisLanguage', options: enumOptions('analysisLanguage'), getCurrent: config_1.getAnalysisLanguage },
    { id: 'llmProvider', settingKey: 'llmProvider', options: enumOptions('llmProvider'), getCurrent: config_1.getLlmProvider },
    { id: 'llmOutputMode', settingKey: 'llmOutputMode', options: enumOptions('llmOutputMode'), getCurrent: config_1.getLlmOutputMode },
    { id: 'displayLanguage', settingKey: 'displayLanguage', options: enumOptions('displayLanguage'), getCurrent: config_1.getDisplayLanguage }
];
module.exports = { SETTINGS_FIELDS: exports.SETTINGS_FIELDS, enumOptions };
