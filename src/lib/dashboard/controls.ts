import type { DashboardHost } from './contracts';
import { getLlmModel } from '../config';
import { escapeHtmlAttr } from './format';
export function buildSelectField(view: DashboardHost, field: import('./settings').SettingsField | undefined) {
    if (!field) throw new Error('Unknown dashboard setting');
    const currentValue = field.getCurrent(view.vscode);
    const options = field.options
      .map(
        ({ value, label }) =>
          `<option value="${value}"${value === currentValue ? ' selected' : ''}>${view.t(label)}</option>`
      )
      .join('');
    return `<select id="${field.id}" data-setting-key="${field.settingKey}">${options}</select>`;
  }

export function buildModelField(view: DashboardHost) {
    const currentModel = getLlmModel(view.vscode);
    if (view.fetchedModels.length === 0) {
      // Even without a fresh fetch, keep the previously saved model selected and usable —
      // Fetch only refreshes the list of available IDs, it isn't required to run a review.
      if (currentModel) {
        return `<select id="llmModel" data-model-select><option value="${escapeHtmlAttr(currentModel)}" selected>${escapeHtmlAttr(currentModel)}${view.t(" (previously selected — Fetch to refresh)")}</option></select>`;
      }
      return `<select id="llmModel" data-model-select disabled><option>${view.t("— fetch models first —")}</option></select>`;
    }
    const options = view.fetchedModels
      .map(({ id, label }) => {
        const text = label ? `${label} (${id})` : id;
        return `<option value="${escapeHtmlAttr(id)}"${id === currentModel ? ' selected' : ''}>${escapeHtmlAttr(text)}</option>`;
      })
      .join('');
    return `<select id="llmModel" data-model-select>${options}</select>`;
  }

export function buildLlmAnalysisStatusNote(view: DashboardHost) {
    const defaultNote = view.t("Requires running \"Analyze Current Workspace\" first. Updates the generated report in place.");
    const status = view.llmAnalysisStatus;
    if (!status) return defaultNote;
    if (status.kind === 'running') {
      return view.t('Running ({details})… this can take up to a minute.', { details: escapeHtmlAttr([status.provider, status.model].filter(Boolean).join(', ')) });
    }
    if (status.kind === 'done') {
      return view.t('Done ({details}). Reopen the report to see the result.', { details: escapeHtmlAttr([status.provider, status.model].filter(Boolean).join(', ')) });
    }
    if (status.kind === 'error') {
      return view.t('Error: {message}', { message: escapeHtmlAttr(status.message) });
    }
    return defaultNote;
  }
