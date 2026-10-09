import { COMMANDS, DASHBOARD_VIEW_ID } from './lib/settingsSchema';
import * as vscode from 'vscode';
import { createCommands } from './lib/commands';
import { CodeDoctorDashboardViewProvider } from './lib/dashboardView';

export function activate(context: import('vscode').ExtensionContext) {
  const dashboardViewProvider = new CodeDoctorDashboardViewProvider(vscode, context);
  const commands = createCommands(vscode, context);

  const disposables = [
    vscode.commands.registerCommand(COMMANDS.analyzeCurrentWorkspace, commands.analyzeCurrentWorkspace),
    vscode.commands.registerCommand(COMMANDS.setLlmApiKey, commands.setLlmApiKey),
    vscode.window.registerWebviewViewProvider(DASHBOARD_VIEW_ID, dashboardViewProvider),
    dashboardViewProvider,
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

export {};
