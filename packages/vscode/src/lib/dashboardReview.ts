import { getLlmProvider, getLlmModel, getLlmMaxOutputTokens, getLlmOutputMode, getReportOpenMode } from './config';

import { getApiKey } from './secrets';
import { runLlmAnalysis, getReportLanguage, LLM_FOCUS } from './analyzer';
import { getLastAnalysis } from './lastAnalysisState';
import { openReport } from './reportViewer';

// Executes the review workflow; the provider owns UI status and rendering.
export async function executeDashboardReview(dashboard: import('./dashboard/contracts').DashboardHost) {
    if (dashboard.isRunningLlmAnalysis) return;

    const lastAnalysis = getLastAnalysis();
    if (!lastAnalysis) {
      dashboard.vscode.window.showErrorMessage(dashboard.t("Run \"Analyze Current Workspace\" first, then request an LLM review."));
      return;
    }

    const provider = getLlmProvider(dashboard.vscode);
    const apiKey = await getApiKey(dashboard.context, provider);
    if (!apiKey) {
      dashboard.vscode.window.showErrorMessage(dashboard.t('No API key set for {provider}. Run "Codes Doctor: Set LLM API Key" first.', { provider }));
      return;
    }

    const model = getLlmModel(dashboard.vscode);
    const agentPrompt = getLlmOutputMode(dashboard.vscode) === 'agentPrompt';

    dashboard.isRunningLlmAnalysis = true;
    dashboard.llmAnalysisStatus = { kind: 'running', provider, model };
    dashboard.render();

    await dashboard.vscode.window.withProgress(
      {
        location: dashboard.vscode.ProgressLocation.Notification,
        title: dashboard.t(agentPrompt ? 'Generating AI coding prompt ({details})' : 'Running LLM review ({details})', { details: [provider, model].filter(Boolean).join(', ') }),
        cancellable: false,
      },
      async () => {
        try {
          await runLlmAnalysis({
            analysisId: lastAnalysis.analysisId,
            outputDir: lastAnalysis.outputDir,
            provider,
            apiKey,
            model: model || undefined,
            focus: agentPrompt ? LLM_FOCUS.agentPrompt : undefined,
            maxOutputTokens: getLlmMaxOutputTokens(dashboard.vscode),
            displayLanguage: getReportLanguage(lastAnalysis.reportPath),
          });
          dashboard.llmAnalysisStatus = { kind: 'done', provider, model };
          // The review is patched into the saved report file in place, but an already-open
          // tab/panel won't pick that up on its own — reopen it so the result is visible
          // without the user having to find and manually reload that tab.
          if (lastAnalysis.reportPath) {
            await openReport(dashboard.vscode, lastAnalysis.reportPath, lastAnalysis.analysisId);
          }
          const mode = getReportOpenMode(dashboard.vscode);
          const doneMessage =
            mode === 'external'
              ? dashboard.t("LLM review complete. Opened in a new browser tab — close any older tab for this report.")
              : dashboard.t("LLM review complete. Report updated.");
          dashboard.vscode.window.showInformationMessage(doneMessage);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          dashboard.llmAnalysisStatus = { kind: 'error', message };
          dashboard.vscode.window.showErrorMessage(dashboard.t('LLM review failed: {message}', { message }));
        } finally {
          dashboard.isRunningLlmAnalysis = false;
          dashboard.render();
        }
      }
    );
  }

module.exports = { executeDashboardReview };
