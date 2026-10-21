"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSecurityRulesSection = buildSecurityRulesSection;
const format_1 = require("./format");
const settingsSchema_1 = require("../settingsSchema");
const config_1 = require("../config");
const MAX_LOCATIONS = 20;
const CHANNEL_LABELS = { emergency: 'Emergency', baseline: 'Baseline', regulatory: 'Regulatory' };
function buildPacks(view, state) {
    const rows = state.packs.map((pack) => `<li class="pack-row">
      <label>
        <input type="checkbox" data-security-pack="${(0, format_1.escapeHtmlAttr)(pack.id)}"${pack.enabled ? ' checked' : ''}${state.busy ? ' disabled' : ''}>
        <span class="pack-name">${(0, format_1.escapeHtmlAttr)(pack.id)}</span>
      </label>
      <span class="badge ${(0, format_1.escapeHtmlAttr)(pack.channel === 'emergency' ? 'badge-alert' : '')}">${view.t(CHANNEL_LABELS[pack.channel] ?? pack.channel)}</span>
      <span class="history-meta">v${(0, format_1.escapeHtmlAttr)(pack.version)} · ${view.t('{count} rules', { count: pack.ruleCount })}</span>
    </li>`).join('');
    return `<ul class="pack-list">${rows}</ul>`;
}
function buildRuleRows(view, state) {
    const scan = state.scan;
    if (!scan)
        return '';
    const rows = [...scan.rules]
        .sort((a, b) => b.candidateCount - a.candidateCount || (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
        .map((rule) => {
        const shown = rule.locations.slice(0, MAX_LOCATIONS).map((location) => `<li class="location" data-security-file="${(0, format_1.escapeHtmlAttr)(location.file)}" data-security-line="${location.line}" title="${(0, format_1.escapeHtmlAttr)(location.file)}:${location.line}">
          <span class="location-file">${(0, format_1.escapeHtmlAttr)(location.file)}</span><span class="history-meta">${'sourceLine' in location ? `L${location.sourceLine} → ` : ':'}${location.line}</span>
        </li>`).join('');
        const more = rule.locations.length > MAX_LOCATIONS
            ? `<li class="note">${view.t('and {count} more — open the exported report for the full list.', { count: rule.locations.length - MAX_LOCATIONS })}</li>`
            : '';
        const steps = rule.checkSteps.map((step) => `<li>${(0, format_1.escapeHtmlAttr)(step)}</li>`).join('');
        const badge = rule.status === 'flow_detected'
            ? `<span class="badge badge-alert">${view.t('Input reaches: {count}', { count: rule.candidateCount })}</span>`
            : rule.status === 'no_flow_detected'
                ? `<span class="badge badge-ok">${view.t('No flow found')}</span>`
                : rule.status === 'no_target_files'
                    ? `<span class="badge">${view.t('No files to analyze')}</span>`
                    : rule.status === 'not_evaluated'
                        ? `<span class="badge badge-warn">${view.t('Not evaluated')}</span>`
                        : rule.candidateCount > 0
                            ? `<span class="badge ${rule.severity === 'error' ? 'badge-alert' : 'badge-warn'}">${view.t('{count} to review', { count: rule.candidateCount })}</span>`
                            : `<span class="badge">${view.t('Manual check')}</span>`;
        const method = `<span class="method">${view.t(rule.method === 'dataflow' ? 'Data flow' : rule.method === 'pattern' ? 'Pattern' : 'Manual')}</span>`;
        return `<details class="rule-row">
        <summary><span class="rule-title">${method}${(0, format_1.escapeHtmlAttr)(rule.title)}</span>${badge}</summary>
        <div class="rule-body">
          <div class="note">${(0, format_1.escapeHtmlAttr)(rule.ruleId)} · ${view.t('Management sheet column')}: ${(0, format_1.escapeHtmlAttr)(rule.excelColumn)} → ${(0, format_1.escapeHtmlAttr)(rule.actionRequired)}</div>
          ${shown || more ? `<ul class="location-list">${shown}${more}</ul>` : ''}
          ${steps ? `<div class="field-label">${view.t('Check steps')}</div><ul class="steps">${steps}</ul>` : ''}
        </div>
      </details>`;
    }).join('');
    return rows;
}
const LANGUAGE_LABELS = { typescript: 'TypeScript', javascript: 'JavaScript', php: 'PHP', json: 'JSON' };
/** What was actually analyzed, so an empty result is not read as a clean bill of health. */
function buildCoverage(view, scan) {
    const languages = Object.entries(scan.filesByLanguage)
        .map(([language, count]) => `${(0, format_1.escapeHtmlAttr)(LANGUAGE_LABELS[language] ?? language)} ${count}`)
        .join(' · ');
    const unsupported = scan.unsupportedFiles > 0
        ? `<div class="note error">${view.t('{count} source files in other languages (Python, Go, Java, …) were not checked: the security rules do not support them yet.', { count: scan.unsupportedFiles })}</div>`
        : '';
    return `<div class="note">${view.t('Analyzed')}: ${languages || '—'}</div>${unsupported}`;
}
function buildResults(view, state) {
    const scan = state.scan;
    if (!scan)
        return `<div class="note">${view.t('Not scanned yet. Select the packs to check, then run "Scan Workspace".')}</div>`;
    const locale = (0, config_1.getDisplayLanguage)(view.vscode) === 'ja' ? 'ja-JP' : 'en-US';
    const flows = scan.rules.filter((rule) => rule.method === 'dataflow').reduce((sum, rule) => sum + rule.candidateCount, 0);
    const candidates = scan.rules.filter((rule) => rule.method !== 'dataflow').reduce((sum, rule) => sum + rule.candidateCount, 0);
    return `<div class="summary-line"><strong>${view.t('{flows} input flows · {count} pattern candidates', { flows, count: candidates })}</strong>
      <span class="history-meta">${view.t('{files} files scanned', { files: scan.scannedFiles })}${scan.testFilesExcluded ? ` · ${view.t('{count} test files excluded', { count: scan.testFilesExcluded })}` : ''} · ${(0, format_1.escapeHtmlAttr)(new Date(scan.at).toLocaleString(locale))}</span></div>
    ${buildCoverage(view, scan)}
    <div class="note">${view.t('"Data flow" items follow untrusted input to dangerous calls within each function. "No flow found" is not proof of safety: flows through other functions or files are not followed. "Manual check" items still need a manual check.')}</div>
    ${buildRuleRows(view, state)}`;
}
function buildSecurityRulesSection(view) {
    const state = view.securityRules?.getState();
    if (!state)
        return '';
    const locale = (0, config_1.getDisplayLanguage)(view.vscode) === 'ja' ? 'ja-JP' : 'en-US';
    const busy = Boolean(state.busy);
    const status = state.loaded
        ? `${view.t('Rules {version}', { version: (0, format_1.escapeHtmlAttr)(state.rulesetVersion ?? '') })} · ${view.t(state.source === 'network' ? 'Downloaded' : 'From local cache')}${state.syncedAt ? ` · ${(0, format_1.escapeHtmlAttr)(new Date(state.syncedAt).toLocaleString(locale))}` : ''}`
        : view.t('No rules loaded yet. Run "Sync Rules" first.');
    const label = (kind, idle, working) => (state.busy === kind ? view.t(working) : view.t(idle));
    return `<details class="card" data-section="security" open>
    <summary class="card-title">${view.t('Security Rules')}</summary>
    <div class="note">${status}</div>
    ${state.error ? `<div class="note error">${(0, format_1.escapeHtmlAttr)(state.error)}</div>` : ''}
    ${state.invalidRuleCount > 0 ? `<div class="note error">${view.t('{count} rules were skipped because their pattern could not be used.', { count: state.invalidRuleCount })}</div>` : ''}
    <div class="field">
      <button class="secondary" data-command="${settingsSchema_1.COMMANDS.syncSecurityRules}"${busy ? ' disabled' : ''}>${label('sync', 'Sync Rules', '⏳ Syncing…')}</button>
    </div>
    ${state.loaded ? `<div class="field"><label class="field-label">${view.t('Packs to check')}</label>${buildPacks(view, state)}</div>` : ''}
    <div class="field">
      <button data-command="${settingsSchema_1.COMMANDS.scanSecurityRules}"${busy ? ' disabled' : ''}>${label('scan', 'Scan Workspace', '⏳ Scanning…')}</button>
      <div class="field-row export-row">
        <button class="secondary" data-command="${settingsSchema_1.COMMANDS.exportSecurityAuditReport}"${busy ? ' disabled' : ''}>${label('export', 'Export Audit Report (JSON/CSV)', '⏳ Exporting…')}</button>
      </div>
    </div>
    <div class="field">${buildResults(view, state)}</div>
  </details>`;
}
module.exports = { buildSecurityRulesSection };
