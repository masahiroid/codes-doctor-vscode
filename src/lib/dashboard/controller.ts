import type { DashboardController } from './contracts';
import { translator } from '../i18n';
import { handleDashboardMessage, fetchDashboardModels, openDashboardReport } from './actions';
import { executeDashboardReview } from '../dashboardReview';
import { buildHtml } from './presentation';

/** Compose UI state with existing workflows; lifecycle belongs to the VS Code adapter. */
export function createDashboardController(
  vscode: typeof import('vscode'),
  context: import('vscode').ExtensionContext,
  onRender: () => void = () => {},
): DashboardController {
  const controller: DashboardController = {
    vscode, context, t: translator(vscode),
    extensionVersion: context.extension?.packageJSON?.version || '',
    fetchedModels: [], modelFetchError: null,
    isRunningLlmAnalysis: false, llmAnalysisStatus: null,
    render: onRender,
    handleMessage: (input) => handleDashboardMessage(controller, input),
    fetchModels: () => fetchDashboardModels(controller),
    runLlmAnalysis: () => executeDashboardReview(controller),
    openReportFromHistory: (analysisId) => openDashboardReport(controller, analysisId),
    buildHtml: () => buildHtml(controller),
  };
  return controller;
}
