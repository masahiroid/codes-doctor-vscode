import { SETTINGS_FIELDS } from './settings';
import type { DashboardHost } from './contracts';
import { COMMANDS, CONFIGURATION_SECTION, isValidTokenLimit } from '../settingsSchema';
import { getExtensionConfig, getLlmProvider } from '../config';
import { getApiKey } from '../secrets';
import { listModels, listReports, getDefaultOutputDir } from '../analyzer';
import { setLastAnalysis } from '../lastAnalysisState';
import { openReport } from '../reportViewer';


export async function handleDashboardMessage(dashboard: DashboardHost, input: unknown) {
    if (!input || typeof input !== 'object') return;
    const message = input as Record<string, unknown>;
    if (typeof message.type !== 'string') return;

    if (message.type === 'command' && typeof message.command === 'string') {
      if (!Object.values(COMMANDS).includes(message.command)) return;
      await dashboard.vscode.commands.executeCommand(message.command);
      return;
    }

    if (message.type === 'setSetting' && typeof message.key === 'string' && typeof message.value === 'string') {
      const field = SETTINGS_FIELDS.find((f) => f.settingKey === message.key);
      if (!field || !field.options.some((option) => option.value === message.value)) return;
      const config = getExtensionConfig(dashboard.vscode);
      await config.update(field.settingKey, message.value, dashboard.vscode.ConfigurationTarget.Global);
      if (field.settingKey === 'llmProvider') {
        // Switching provider invalidates the previously fetched model list.
        dashboard.fetchedModels = [];
        dashboard.modelFetchError = null;
      }
      dashboard.render();
      return;
    }

    if (message.type === 'setLlmModel' && typeof message.value === 'string') {
      const config = getExtensionConfig(dashboard.vscode);
      await config.update('llmModel', message.value, dashboard.vscode.ConfigurationTarget.Global);
      dashboard.render();
      return;
    }

    if (message.type === 'setLlmMaxOutputTokens') {
      if (!isValidTokenLimit(message.value)) return;
      await getExtensionConfig(dashboard.vscode).update('llmMaxOutputTokens', message.value, dashboard.vscode.ConfigurationTarget.Global);
      dashboard.render();
      return;
    }

    if (message.type === 'fetchModels') {
      await dashboard.fetchModels();
      return;
    }

    if (message.type === 'runLlmAnalysis') {
      if (dashboard.isRunningLlmAnalysis) return;
      await dashboard.runLlmAnalysis();
      return;
    }

    if (message.type === 'openReportFromHistory' && typeof message.analysisId === 'string') {
      await dashboard.openReportFromHistory(message.analysisId);
      return;
    }
  }

export async function fetchDashboardModels(dashboard: DashboardHost) {
    const provider = getLlmProvider(dashboard.vscode);
    const apiKey = await getApiKey(dashboard.context, provider);
    if (!apiKey) {
      dashboard.modelFetchError = dashboard.t('No API key set for {provider}. Run "Codes Doctor: Set LLM API Key" first.', { provider });
      dashboard.fetchedModels = [];
      dashboard.render();
      return;
    }

    dashboard.modelFetchError = dashboard.t("Fetching models...");
    dashboard.render();

    try {
      dashboard.fetchedModels = await listModels(provider, apiKey);
      dashboard.modelFetchError = null;
    } catch (error) {
      dashboard.fetchedModels = [];
      dashboard.modelFetchError = error instanceof Error ? error.message : String(error);
    }
    dashboard.render();
  }

export async function openDashboardReport(dashboard: DashboardHost, analysisId: string) {
    const outputDir = getDefaultOutputDir(dashboard.context);
    const reports = listReports(outputDir);
    const match = reports.find((r) => r.analysisId === analysisId);
    if (!match) {
      dashboard.vscode.window.showErrorMessage(dashboard.t('Report not found: {analysisId}', { analysisId }));
      return;
    }

    setLastAnalysis(match.analysisId, outputDir, match.reportPath);
    dashboard.llmAnalysisStatus = null;
    dashboard.render();
    await openReport(dashboard.vscode, match.reportPath, match.analysisId);
  }
