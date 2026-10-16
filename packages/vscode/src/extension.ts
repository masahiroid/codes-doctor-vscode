import { COMMANDS, DASHBOARD_VIEW_ID, FINDINGS_VIEW_ID } from './lib/settingsSchema';
import * as vscode from 'vscode';
import { createCommands } from './lib/commands';
import { CodeDoctorDashboardViewProvider } from './lib/dashboardView';
import { FindingsTreeDataProvider } from './lib/findingsTreeView';
import { createHoverProvider } from './lib/hoverProvider';
import { createIgnoreCodeActionProvider } from './lib/ignoreComments';
import { createOnSaveController } from './lib/onSaveWatcher';
import { createStatusBarController } from './lib/statusBar';

export function activate(context: import('vscode').ExtensionContext) {
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeDoctor');
  const dashboardViewProvider = new CodeDoctorDashboardViewProvider(vscode, context);
  const findingsProvider = new FindingsTreeDataProvider(vscode);
  const statusBar = createStatusBarController(vscode);
  const commands = createCommands(vscode, context, diagnosticCollection);
  const onSaveController = createOnSaveController(vscode, context, diagnosticCollection);

  const disposables = [
    diagnosticCollection,
    vscode.commands.registerCommand(COMMANDS.analyzeCurrentWorkspace, commands.analyzeCurrentWorkspace),
    vscode.commands.registerCommand(COMMANDS.analyzeGitChanges, commands.analyzeGitChanges),
    vscode.commands.registerCommand(COMMANDS.setLlmApiKey, commands.setLlmApiKey),
    vscode.commands.registerCommand(COMMANDS.copySummary, commands.copySummary),
    vscode.commands.registerCommand(COMMANDS.copySummaryJson, commands.copySummaryJson),
    vscode.commands.registerCommand(COMMANDS.openLastReport, commands.openLastReport),
    vscode.commands.registerCommand(COMMANDS.clearDiagnostics, commands.clearDiagnostics),
    vscode.commands.registerCommand(COMMANDS.openFindingLocation, commands.openFindingLocation),
    vscode.window.registerWebviewViewProvider(DASHBOARD_VIEW_ID, dashboardViewProvider),
    vscode.window.registerTreeDataProvider(FINDINGS_VIEW_ID, findingsProvider),
    vscode.languages.registerHoverProvider({ scheme: 'file' }, createHoverProvider(vscode)),
    vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      createIgnoreCodeActionProvider(vscode),
      vscode.CodeActionKind ? { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] } : undefined,
    ),
    dashboardViewProvider,
    findingsProvider,
    statusBar,
    onSaveController,
  ];

  context.subscriptions.push(...disposables);
}

export function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

export {};
