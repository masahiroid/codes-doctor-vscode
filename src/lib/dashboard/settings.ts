import { getReportOpenMode, getAnalysisLanguage, getLlmProvider, getLlmOutputMode, getDisplayLanguage } from '../config';
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

const LLM_OUTPUT_MODE_OPTIONS = [
  { value: 'review', label: 'Review report' },
  { value: 'agentPrompt', label: 'AI coding agent prompt' },
];

/** Dashboard <select> elements that map 1:1 to a `codeDoctor.*` setting. */
export interface SettingsField {
  id: string;
  settingKey: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  getCurrent(vscode: typeof import('vscode')): string;
}
export const SETTINGS_FIELDS: readonly SettingsField[] = [
  { id: 'reportOpenMode', settingKey: 'reportOpenMode', options: REPORT_OPEN_MODE_OPTIONS, getCurrent: getReportOpenMode },
  { id: 'analysisLanguage', settingKey: 'analysisLanguage', options: ANALYSIS_LANGUAGE_OPTIONS, getCurrent: getAnalysisLanguage },
  { id: 'llmProvider', settingKey: 'llmProvider', options: LLM_PROVIDER_OPTIONS, getCurrent: getLlmProvider },
  { id: 'llmOutputMode', settingKey: 'llmOutputMode', options: LLM_OUTPUT_MODE_OPTIONS, getCurrent: getLlmOutputMode },
  { id: 'displayLanguage', settingKey: 'displayLanguage', options: [{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }], getCurrent: getDisplayLanguage }
];


module.exports = { SETTINGS_FIELDS };
