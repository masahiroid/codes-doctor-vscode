"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardController = createDashboardController;
const i18n_1 = require("../i18n");
const actions_1 = require("./actions");
const dashboardReview_1 = require("../dashboardReview");
const presentation_1 = require("./presentation");
/** Compose UI state with existing workflows; lifecycle belongs to the VS Code adapter. */
function createDashboardController(vscode, context, onRender = () => { }) {
    const controller = {
        vscode, context, t: (0, i18n_1.translator)(vscode),
        extensionVersion: context.extension?.packageJSON?.version || '',
        fetchedModels: [], modelFetchError: null,
        isRunningLlmAnalysis: false, llmAnalysisStatus: null,
        render: onRender,
        handleMessage: (input) => (0, actions_1.handleDashboardMessage)(controller, input),
        fetchModels: () => (0, actions_1.fetchDashboardModels)(controller),
        runLlmAnalysis: () => (0, dashboardReview_1.executeDashboardReview)(controller),
        openReportFromHistory: (analysisId) => (0, actions_1.openDashboardReport)(controller, analysisId),
        buildHtml: () => (0, presentation_1.buildHtml)(controller),
    };
    return controller;
}
