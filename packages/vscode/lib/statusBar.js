"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusBarController = createStatusBarController;
const lastAnalysisState_1 = require("./lastAnalysisState");
const summary_1 = require("./summary");
const i18n_1 = require("./i18n");
function createStatusBarController(vscode) {
    if (!vscode.window?.createStatusBarItem) {
        return { update: () => { }, dispose: () => { } };
    }
    const alignment = vscode.StatusBarAlignment?.Right ?? 2;
    const item = vscode.window.createStatusBarItem(alignment, 100);
    function update() {
        const t = (0, i18n_1.translator)(vscode);
        const last = (0, lastAnalysisState_1.getLastAnalysis)();
        if (!last || !last.summary) {
            item.text = '$(pulse) Codes Doctor';
            item.tooltip = t('Analyze Current Workspace');
            item.command = 'codeDoctor.analyzeCurrentWorkspace';
            item.backgroundColor = undefined;
            item.show();
            return;
        }
        const { summary } = last;
        const sec = summary.security ? String(summary.security.score) : 'N/A';
        const debt = summary.technicalDebt ? String(summary.technicalDebt.score) : 'N/A';
        if (summary.failures.length > 0) {
            item.text = `$(warning) Codes Doctor: Sec ${sec} | Debt ${debt}`;
            item.backgroundColor = vscode.ThemeColor
                ? new vscode.ThemeColor('statusBarItem.warningBackground')
                : undefined;
        }
        else {
            item.text = `$(shield) Sec: ${sec} | $(tools) Debt: ${debt}`;
            item.backgroundColor = undefined;
        }
        item.tooltip = (0, summary_1.formatSummary)(summary);
        item.command = last.reportPath ? 'codeDoctor.openLastReport' : 'codeDoctor.analyzeCurrentWorkspace';
        item.show();
    }
    const sub = (0, lastAnalysisState_1.onLastAnalysisChanged)(() => update());
    update();
    return {
        item,
        update,
        dispose() {
            sub.dispose();
            item.dispose();
        },
    };
}
module.exports = {
    createStatusBarController,
};
