"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSelectField = buildSelectField;
exports.buildModelField = buildModelField;
exports.buildLlmAnalysisStatusNote = buildLlmAnalysisStatusNote;
const config_1 = require("../config");
const format_1 = require("./format");
function buildSelectField(view, field) {
    if (!field)
        throw new Error('Unknown dashboard setting');
    const currentValue = field.getCurrent(view.vscode);
    const options = field.options
        .map(({ value, label }) => `<option value="${value}"${value === currentValue ? ' selected' : ''}>${view.t(label)}</option>`)
        .join('');
    return `<select id="${field.id}" data-setting-key="${field.settingKey}">${options}</select>`;
}
function buildModelField(view) {
    const currentModel = (0, config_1.getLlmModel)(view.vscode);
    if (view.fetchedModels.length === 0) {
        // Even without a fresh fetch, keep the previously saved model selected and usable —
        // Fetch only refreshes the list of available IDs, it isn't required to run a review.
        if (currentModel) {
            return `<select id="llmModel" data-model-select><option value="${(0, format_1.escapeHtmlAttr)(currentModel)}" selected>${(0, format_1.escapeHtmlAttr)(currentModel)}${view.t(" (previously selected — Fetch to refresh)")}</option></select>`;
        }
        return `<select id="llmModel" data-model-select disabled><option>${view.t("— fetch models first —")}</option></select>`;
    }
    const options = view.fetchedModels
        .map(({ id, label }) => {
        const text = label ? `${label} (${id})` : id;
        return `<option value="${(0, format_1.escapeHtmlAttr)(id)}"${id === currentModel ? ' selected' : ''}>${(0, format_1.escapeHtmlAttr)(text)}</option>`;
    })
        .join('');
    return `<select id="llmModel" data-model-select>${options}</select>`;
}
function buildLlmAnalysisStatusNote(view) {
    const defaultNote = view.t("Requires running \"Analyze Current Workspace\" first. Updates the generated report in place.");
    const status = view.llmAnalysisStatus;
    if (!status)
        return defaultNote;
    if (status.kind === 'running') {
        return view.t('Running ({details})… this can take up to a minute.', { details: (0, format_1.escapeHtmlAttr)([status.provider, status.model].filter(Boolean).join(', ')) });
    }
    if (status.kind === 'done') {
        return view.t('Done ({details}). Reopen the report to see the result.', { details: (0, format_1.escapeHtmlAttr)([status.provider, status.model].filter(Boolean).join(', ')) });
    }
    if (status.kind === 'error') {
        return view.t('Error: {message}', { message: (0, format_1.escapeHtmlAttr)(status.message) });
    }
    return defaultNote;
}
