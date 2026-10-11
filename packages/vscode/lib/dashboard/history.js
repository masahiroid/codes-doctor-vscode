"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildReportHistory = buildReportHistory;
exports.buildLlmHistory = buildLlmHistory;
const repository_1 = require("../reports/repository");
const lastAnalysisState_1 = require("../lastAnalysisState");
const config_1 = require("../config");
const format_1 = require("./format");
const analyzer_1 = require("../analyzer");
/** Short history-list label for each engine focus ID. */
const FOCUS_LABELS = {
    [analyzer_1.LLM_FOCUS.review]: 'Structural Review',
    [analyzer_1.LLM_FOCUS.astOnly]: 'AST Review',
    [analyzer_1.LLM_FOCUS.agentPrompt]: 'AI Coding Prompt',
};
function focusLabel(focus) {
    return FOCUS_LABELS[focus] || focus;
}
function buildReportHistory(view) {
    const outputDir = (0, repository_1.getDefaultOutputDir)(view.context);
    const reports = (0, repository_1.listReports)(outputDir);
    if (reports.length === 0) {
        return `<div class="note">${view.t("No reports generated yet.")}</div>`;
    }
    const activeAnalysisId = (0, lastAnalysisState_1.getLastAnalysis)()?.analysisId;
    const rows = reports
        .map((r) => {
        const when = r.analyzedAt ? new Date(r.analyzedAt).toLocaleString((0, config_1.getDisplayLanguage)(view.vscode) === 'ja' ? 'ja-JP' : 'en-US') : new Date(r.mtimeMs).toLocaleString((0, config_1.getDisplayLanguage)(view.vscode) === 'ja' ? 'ja-JP' : 'en-US');
        const title = r.repoName || r.analysisId;
        const isActive = r.analysisId === activeAnalysisId;
        return `<li class="history-row${isActive ? ' active' : ''}" data-analysis-id="${(0, format_1.escapeHtmlAttr)(r.analysisId)}" title="${(0, format_1.escapeHtmlAttr)(r.analysisId)}">
          <span class="history-focus">${(0, format_1.escapeHtmlAttr)(title)}</span>
          <span class="history-meta">${(0, format_1.escapeHtmlAttr)(when)}</span>
        </li>`;
    })
        .join('');
    return `<ul class="history-list">${rows}</ul>`;
}
function buildLlmHistory(view) {
    const lastAnalysis = (0, lastAnalysisState_1.getLastAnalysis)();
    if (!lastAnalysis) {
        return `<div class="note">${view.t("Run \"Analyze Current Workspace\" first to see review history here.")}</div>`;
    }
    const results = (0, repository_1.listLlmResults)(lastAnalysis.analysisId, lastAnalysis.outputDir);
    if (results.length === 0) {
        return `<div class="note">${view.t("No LLM reviews run yet for this analysis.")}</div>`;
    }
    const rows = results
        .map((r) => {
        const when = r.createdAt ? new Date(r.createdAt).toLocaleString((0, config_1.getDisplayLanguage)(view.vscode) === 'ja' ? 'ja-JP' : 'en-US') : '—';
        const label = view.t(focusLabel(r.focus));
        const providerModel = [r.provider, r.model].filter(Boolean).join(' / ') || '—';
        return `<li><span class="history-focus">${(0, format_1.escapeHtmlAttr)(label)}</span><span class="history-meta">${(0, format_1.escapeHtmlAttr)(providerModel)} · ${(0, format_1.escapeHtmlAttr)(when)}</span></li>`;
    })
        .join('');
    return `<ul class="history-list">${rows}</ul>`;
}
