"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLlmHistory = exports.buildReportHistory = exports.buildLlmAnalysisStatusNote = exports.buildModelField = exports.buildSelectField = void 0;
exports.buildHtml = buildHtml;
const format_1 = require("./format");
const browser_1 = require("./browser");
const history_1 = require("./history");
Object.defineProperty(exports, "buildReportHistory", { enumerable: true, get: function () { return history_1.buildReportHistory; } });
Object.defineProperty(exports, "buildLlmHistory", { enumerable: true, get: function () { return history_1.buildLlmHistory; } });
const controls_1 = require("./controls");
Object.defineProperty(exports, "buildSelectField", { enumerable: true, get: function () { return controls_1.buildSelectField; } });
Object.defineProperty(exports, "buildModelField", { enumerable: true, get: function () { return controls_1.buildModelField; } });
Object.defineProperty(exports, "buildLlmAnalysisStatusNote", { enumerable: true, get: function () { return controls_1.buildLlmAnalysisStatusNote; } });
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const styles = node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, 'styles.css'), 'utf8');
const config_1 = require("../config");
const settings_1 = require("./settings");
const settingsSchema_1 = require("../settingsSchema");
function buildHtml(view) {
    const escapedError = view.modelFetchError
        ? (0, format_1.escapeHtmlAttr)(view.modelFetchError)
        : '';
    return `<!DOCTYPE html>
<html lang="${(0, config_1.getDisplayLanguage)(view.vscode)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${styles}</style>
</head>
<body>
  <div class="card">
    <p>${view.t("Codes Doctor analyzes the currently opened workspace folder and generates a structural diagnosis report (God Classes, technical debt, security score, dependency graphs, SBOM).")}</p>
    ${view.extensionVersion ? `<p style="margin-top:6px; opacity:0.55; font-size:11px;">v${(0, format_1.escapeHtmlAttr)(view.extensionVersion)}</p>` : ''}
  </div>

  <div class="card">
    <div class="field">
      <label class="field-label" for="displayLanguage">${view.t('Display & Report Language')}</label>
      ${(0, controls_1.buildSelectField)(view, settings_1.SETTINGS_FIELDS.find((field) => field.settingKey === 'displayLanguage'))}
    </div>
    <div class="field">
      <label class="field-label" for="analysisLanguage">${view.t("Language Mode")}</label>
      ${(0, controls_1.buildSelectField)(view, settings_1.SETTINGS_FIELDS.find((field) => field.settingKey === 'analysisLanguage'))}
    </div>
    <div class="field">
      <label class="field-label" for="reportOpenMode">${view.t("Open Report Using")}</label>
      ${(0, controls_1.buildSelectField)(view, settings_1.SETTINGS_FIELDS.find((field) => field.settingKey === 'reportOpenMode'))}
    </div>
  </div>

  <button data-command="${settingsSchema_1.COMMANDS.analyzeCurrentWorkspace}">${view.t("Analyze Current Workspace")}</button>

  <div class="card" style="margin-top: 12px;">
    <div class="field">
      <label class="field-label">${view.t("Report History")}</label>
      ${(0, history_1.buildReportHistory)(view)}
    </div>
  </div>

  <div class="card" style="margin-top: 12px;">
    <div class="field">
      <label class="field-label" for="llmProvider">${view.t("LLM Provider")}</label>
      ${(0, controls_1.buildSelectField)(view, settings_1.SETTINGS_FIELDS.find((field) => field.settingKey === 'llmProvider'))}
    </div>
    <div class="field">
      <button class="secondary" data-action="setApiKey">${view.t("Set API Key")}</button>
    </div>
    <div class="field">
      <label class="field-label" for="llmModel">${view.t("Model")}</label>
      <div class="field-row">
        ${(0, controls_1.buildModelField)(view)}
        <button class="secondary" data-action="fetchModels">${view.t("Fetch")}</button>
      </div>
      ${escapedError ? `<div class="note error">${escapedError}</div>` : ''}
    </div>
    <div class="field">
      <label class="field-label" for="llmMaxOutputTokens">${view.t("Maximum output tokens")}</label>
      <input id="llmMaxOutputTokens" type="number" min="${settingsSchema_1.TOKEN_LIMITS.minimum}" max="${settingsSchema_1.TOKEN_LIMITS.maximum}" step="1" value="${(0, config_1.getLlmMaxOutputTokens)(view.vscode)}" ${view.isRunningLlmAnalysis ? 'disabled' : ''}>
      <div class="note">${view.t("Starting points: non-reasoning 4,000–8,000; reasoning 16,000–32,000. Input tokens are separate; reasoning counts toward this limit. Stay within the model’s output limit. Empty OpenAI output at the limit retries once with max(2 × this value, 16,000), which may increase cost.")}</div>
    </div>
    <div class="field">
      <button data-action="runLlmAnalysis" ${view.isRunningLlmAnalysis ? 'disabled' : ''}>${view.isRunningLlmAnalysis ? view.t("⏳ Running…") : view.t("Run LLM Review")}</button>
      <div class="note${view.llmAnalysisStatus?.kind === 'error' ? ' error' : ''}">${(0, controls_1.buildLlmAnalysisStatusNote)(view)}</div>
    </div>
    <div class="field">
      <label class="field-label">${view.t("LLM Review History")}</label>
      ${(0, history_1.buildLlmHistory)(view)}
    </div>
  </div>

  <script>(${browser_1.installDashboardControls.toString()})(${JSON.stringify(settingsSchema_1.COMMANDS.setLlmApiKey)});</script>
</body>
</html>`;
}
module.exports = { buildSelectField: controls_1.buildSelectField, buildModelField: controls_1.buildModelField, buildReportHistory: history_1.buildReportHistory, buildLlmHistory: history_1.buildLlmHistory, buildLlmAnalysisStatusNote: controls_1.buildLlmAnalysisStatusNote, buildHtml };
