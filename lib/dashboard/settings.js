"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SETTINGS_FIELDS = void 0;
const config_1 = require("../config");
const REPORT_OPEN_MODE_OPTIONS = [
    { value: 'external', label: "External Browser" },
    { value: 'webview', label: "VS Code WebView" },
    { value: 'vscode', label: "VS Code URI Open" },
];
const ANALYSIS_LANGUAGE_OPTIONS = [
    { value: 'auto', label: "Auto Detect (recommended)" },
    { value: 'typescript', label: 'TypeScript/JavaScript' },
    { value: 'javascript', label: "JavaScript only" },
    { value: 'php', label: 'PHP' },
    { value: 'dart', label: 'Dart' },
    { value: 'python', label: 'Python' },
    { value: 'go', label: 'Go' },
    { value: 'swift', label: 'Swift' },
    { value: 'csharp', label: 'C#' },
    { value: 'java', label: 'Java' },
    { value: 'kotlin', label: 'Kotlin' },
    { value: 'rust', label: 'Rust' },
    { value: 'cpp', label: 'C++' },
];
const LLM_PROVIDER_OPTIONS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic (Claude)' },
];
exports.SETTINGS_FIELDS = [
    { id: 'reportOpenMode', settingKey: 'reportOpenMode', options: REPORT_OPEN_MODE_OPTIONS, getCurrent: config_1.getReportOpenMode },
    { id: 'analysisLanguage', settingKey: 'analysisLanguage', options: ANALYSIS_LANGUAGE_OPTIONS, getCurrent: config_1.getAnalysisLanguage },
    { id: 'llmProvider', settingKey: 'llmProvider', options: LLM_PROVIDER_OPTIONS, getCurrent: config_1.getLlmProvider },
    { id: 'displayLanguage', settingKey: 'displayLanguage', options: [{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }], getCurrent: config_1.getDisplayLanguage }
];
module.exports = { SETTINGS_FIELDS: exports.SETTINGS_FIELDS };
