import type { DashboardHost } from './contracts';
import { listLlmResults, listReports, getDefaultOutputDir } from '../reports/repository';
import { getLastAnalysis } from '../lastAnalysisState';
import { getDisplayLanguage } from '../config';
import { escapeHtmlAttr } from './format';
/** Focus IDs used by csap-main's llmService.ts (resolveAnalysisFocus), mapped to a
 * short human label for the history list. 'graph-metrics' is the default full-review
 * focus when none is passed; 'ast-structure-only' is always used for astOnlyMode runs. */
const FOCUS_LABELS: Record<string, string> = {
  'graph-metrics': 'Structural Review',
  'ast-structure-only': 'AST Review',
};

function focusLabel(focus: string) {
  return FOCUS_LABELS[focus] || focus;
}

export function buildReportHistory(view: DashboardHost) {
    const outputDir = getDefaultOutputDir(view.context);
    const reports = listReports(outputDir);
    if (reports.length === 0) {
      return `<div class="note">${view.t("No reports generated yet.")}</div>`;
    }

    const activeAnalysisId = getLastAnalysis()?.analysisId;
    const rows = reports
      .map((r) => {
        const when = r.analyzedAt ? new Date(r.analyzedAt).toLocaleString(getDisplayLanguage(view.vscode) === 'ja' ? 'ja-JP' : 'en-US') : new Date(r.mtimeMs).toLocaleString(getDisplayLanguage(view.vscode) === 'ja' ? 'ja-JP' : 'en-US');
        const title = r.repoName || r.analysisId;
        const isActive = r.analysisId === activeAnalysisId;
        return `<li class="history-row${isActive ? ' active' : ''}" data-analysis-id="${escapeHtmlAttr(r.analysisId)}" title="${escapeHtmlAttr(r.analysisId)}">
          <span class="history-focus">${escapeHtmlAttr(title)}</span>
          <span class="history-meta">${escapeHtmlAttr(when)}</span>
        </li>`;
      })
      .join('');

    return `<ul class="history-list">${rows}</ul>`;
  }

export function buildLlmHistory(view: DashboardHost) {
    const lastAnalysis = getLastAnalysis();
    if (!lastAnalysis) {
      return `<div class="note">${view.t("Run \"Analyze Current Workspace\" first to see review history here.")}</div>`;
    }

    const results = listLlmResults(lastAnalysis.analysisId, lastAnalysis.outputDir);
    if (results.length === 0) {
      return `<div class="note">${view.t("No LLM reviews run yet for this analysis.")}</div>`;
    }

    const rows = results
      .map((r) => {
        const when = r.createdAt ? new Date(r.createdAt).toLocaleString(getDisplayLanguage(view.vscode) === 'ja' ? 'ja-JP' : 'en-US') : '—';
        const label = view.t(focusLabel(r.focus));
        const providerModel = [r.provider, r.model].filter(Boolean).join(' / ') || '—';
        return `<li><span class="history-focus">${escapeHtmlAttr(label)}</span><span class="history-meta">${escapeHtmlAttr(providerModel)} · ${escapeHtmlAttr(when)}</span></li>`;
      })
      .join('');

    return `<ul class="history-list">${rows}</ul>`;
  }
