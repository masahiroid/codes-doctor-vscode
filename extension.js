const vscode = require('vscode');
const { createCommands } = require('./lib/commands');
const { CodeDoctorDashboardViewProvider } = require('./lib/dashboardView');

function activate(context) {
  const dashboardViewProvider = new CodeDoctorDashboardViewProvider(vscode, context);
  const commands = createCommands(vscode, context);

  const disposables = [
    vscode.commands.registerCommand('codeDoctor.analyzeCurrentWorkspace', commands.analyzeCurrentWorkspace),
    vscode.commands.registerCommand('codeDoctor.setLlmApiKey', commands.setLlmApiKey),
    vscode.window.registerWebviewViewProvider('codeDoctor.actions', dashboardViewProvider),
    dashboardViewProvider,
  ];

  context.subscriptions.push(...disposables);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
