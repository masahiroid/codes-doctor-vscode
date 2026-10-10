import type { DashboardHost } from './contracts';
import { escapeHtmlAttr } from './format';
import { installDashboardControls } from './browser';
import { buildReportHistory, buildLlmHistory } from './history';
import { buildSelectField, buildModelField, buildLlmAnalysisStatusNote } from './controls';
import fs from 'node:fs';
import path from 'node:path';
const styles = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
import { getLlmModel, getLlmMaxOutputTokens, getLlmOutputMode, getDisplayLanguage } from '../config';
import { SETTINGS_FIELDS } from './settings';
import { TOKEN_LIMITS, COMMANDS } from '../settingsSchema';

export function buildHtml(view: DashboardHost) {
    const escapedError = view.modelFetchError
      ? escapeHtmlAttr(view.modelFetchError)
      : '';
    const runLabel = getLlmOutputMode(view.vscode) === 'agentPrompt'
      ? view.t("Generate AI Coding Prompt")
      : view.t("Run LLM Review");

    return `<!DOCTYPE html>
<html lang="${getDisplayLanguage(view.vscode)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>${styles}</style>
</head>
<body>
  <div class="card">
    <p>${view.t("Codes Doctor analyzes the currently opened workspace folder and generates a structural diagnosis report (God Classes, technical debt, security score, dependency graphs, SBOM).")}</p>
    ${view.extensionVersion ? `<p style="margin-top:6px; opacity:0.55; font-size:11px;">v${escapeHtmlAttr(view.extensionVersion)}</p>` : ''}
  </div>

  <div class="card">
    <div class="field">
      <label class="field-label" for="displayLanguage">${view.t('Display & Report Language')}</label>
      ${buildSelectField(view, SETTINGS_FIELDS.find((field) => field.settingKey === 'displayLanguage'))}
    </div>
    <div class="field">
      <label class="field-label" for="analysisLanguage">${view.t("Language Mode")}</label>
      ${buildSelectField(view, SETTINGS_FIELDS.find((field) => field.settingKey === 'analysisLanguage'))}
    </div>
    <div class="field">
      <label class="field-label" for="reportOpenMode">${view.t("Open Report Using")}</label>
      ${buildSelectField(view, SETTINGS_FIELDS.find((field) => field.settingKey === 'reportOpenMode'))}
    </div>
  </div>

  <button data-command="${COMMANDS.analyzeCurrentWorkspace}">${view.t("Analyze Current Workspace")}</button>

  <div class="card" style="margin-top: 12px;">
    <div class="field">
      <label class="field-label">${view.t("Report History")}</label>
      ${buildReportHistory(view)}
    </div>
  </div>

  <div class="card" style="margin-top: 12px;">
    <div class="field">
      <label class="field-label" for="llmProvider">${view.t("LLM Provider")}</label>
      ${buildSelectField(view, SETTINGS_FIELDS.find((field) => field.settingKey === 'llmProvider'))}
    </div>
    <div class="field">
      <button class="secondary" data-action="setApiKey">${view.t("Set API Key")}</button>
    </div>
    <div class="field">
      <label class="field-label" for="llmModel">${view.t("Model")}</label>
      <div class="field-row">
        ${buildModelField(view)}
        <button class="secondary" data-action="fetchModels">${view.t("Fetch")}</button>
      </div>
      ${escapedError ? `<div class="note error">${escapedError}</div>` : ''}
    </div>
    <div class="field">
      <label class="field-label" for="llmMaxOutputTokens">${view.t("Maximum output tokens")}</label>
      <input id="llmMaxOutputTokens" type="number" min="${TOKEN_LIMITS.minimum}" max="${TOKEN_LIMITS.maximum}" step="1" value="${getLlmMaxOutputTokens(view.vscode)}" ${view.isRunningLlmAnalysis ? 'disabled' : ''}>
      <div class="note">${view.t("Starting points: non-reasoning 4,000–8,000; reasoning 16,000–32,000. Input tokens are separate; reasoning counts toward this limit. Stay within the model’s output limit. Empty OpenAI output at the limit retries once with max(2 × this value, 16,000), which may increase cost.")}</div>
    </div>
    <div class="field">
      <label class="field-label" for="llmOutputMode">${view.t("Output Mode")}</label>
      ${buildSelectField(view, SETTINGS_FIELDS.find((field) => field.settingKey === 'llmOutputMode'))}
      <div class="note">${view.t("\"AI coding agent prompt\" writes instructions you can paste into Claude Code, Cursor, GitHub Copilot, or Codex. It appears in the report's LLM tab with a copy button.")}</div>
    </div>
    <div class="field">
      <button data-action="runLlmAnalysis" ${view.isRunningLlmAnalysis ? 'disabled' : ''}>${view.isRunningLlmAnalysis ? view.t("⏳ Running…") : runLabel}</button>
      <div class="note${view.llmAnalysisStatus?.kind === 'error' ? ' error' : ''}">${buildLlmAnalysisStatusNote(view)}</div>
    </div>
    <div class="field">
      <label class="field-label">${view.t("LLM Review History")}</label>
      ${buildLlmHistory(view)}
    </div>
  </div>

  <script>(${installDashboardControls.toString()})(${JSON.stringify(COMMANDS.setLlmApiKey)});</script>
</body>
</html>`;
  }

module.exports = { buildSelectField, buildModelField, buildReportHistory, buildLlmHistory, buildLlmAnalysisStatusNote, buildHtml };


export { buildSelectField, buildModelField, buildLlmAnalysisStatusNote, buildReportHistory, buildLlmHistory };
