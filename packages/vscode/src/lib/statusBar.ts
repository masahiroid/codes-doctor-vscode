import { getLastAnalysis, onLastAnalysisChanged } from './lastAnalysisState';
import { formatSummary } from './summary';
import { translator } from './i18n';

export function createStatusBarController(vscode: typeof import('vscode')) {
  if (!vscode.window?.createStatusBarItem) {
    return { update: () => {}, dispose: () => {} };
  }

  const alignment = vscode.StatusBarAlignment?.Right ?? 2;
  const item = vscode.window.createStatusBarItem(alignment, 100);

  function update() {
    const t = translator(vscode);
    const last = getLastAnalysis();
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
    } else {
      item.text = `$(shield) Sec: ${sec} | $(tools) Debt: ${debt}`;
      item.backgroundColor = undefined;
    }

    item.tooltip = formatSummary(summary);
    item.command = last.reportPath ? 'codeDoctor.openLastReport' : 'codeDoctor.analyzeCurrentWorkspace';
    item.show();
  }

  const sub = onLastAnalysisChanged(() => update());
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

