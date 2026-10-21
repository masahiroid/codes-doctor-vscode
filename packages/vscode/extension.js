"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const settingsSchema_1 = require("./lib/settingsSchema");
const vscode = __importStar(require("vscode"));
const aiFixPreview_1 = require("./lib/aiFixPreview");
const chatParticipant_1 = require("./lib/chatParticipant");
const commands_1 = require("./lib/commands");
const dashboardView_1 = require("./lib/dashboardView");
const findingsTreeView_1 = require("./lib/findingsTreeView");
const hoverProvider_1 = require("./lib/hoverProvider");
const ignoreComments_1 = require("./lib/ignoreComments");
const onSaveWatcher_1 = require("./lib/onSaveWatcher");
const securityRulesController_1 = require("./lib/securityRulesController");
const statusBar_1 = require("./lib/statusBar");
function activate(context) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('codeDoctor');
    const findingsProvider = new findingsTreeView_1.FindingsTreeDataProvider(vscode);
    const statusBar = (0, statusBar_1.createStatusBarController)(vscode);
    const commands = (0, commands_1.createCommands)(vscode, context, diagnosticCollection);
    const onSaveController = (0, onSaveWatcher_1.createOnSaveController)(vscode, context, diagnosticCollection);
    const aiPreviewProvider = (0, aiFixPreview_1.registerAiPreviewContentProvider)(vscode);
    const chatParticipant = (0, chatParticipant_1.registerChatParticipant)(vscode, context);
    const securityRules = (0, securityRulesController_1.createSecurityRulesController)(vscode, context);
    const dashboardViewProvider = new dashboardView_1.CodeDoctorDashboardViewProvider(vscode, context, securityRules.panel);
    const disposables = [
        diagnosticCollection,
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.analyzeCurrentWorkspace, commands.analyzeCurrentWorkspace),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.analyzeGitChanges, commands.analyzeGitChanges),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.previewAiFix, commands.previewAiFix),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.setLlmApiKey, commands.setLlmApiKey),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.copySummary, commands.copySummary),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.copySummaryJson, commands.copySummaryJson),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.openLastReport, commands.openLastReport),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.clearDiagnostics, commands.clearDiagnostics),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.syncSecurityRules, securityRules.syncRules),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.scanSecurityRules, securityRules.scanSecurityRules),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.exportSecurityAuditReport, securityRules.exportReport),
        vscode.commands.registerCommand(settingsSchema_1.COMMANDS.openFindingLocation, commands.openFindingLocation),
        vscode.window.registerWebviewViewProvider(settingsSchema_1.DASHBOARD_VIEW_ID, dashboardViewProvider),
        vscode.window.registerTreeDataProvider(settingsSchema_1.FINDINGS_VIEW_ID, findingsProvider),
        vscode.languages.registerHoverProvider({ scheme: 'file' }, (0, hoverProvider_1.createHoverProvider)(vscode)),
        vscode.languages.registerHoverProvider({ scheme: 'file' }, securityRules.hoverProvider),
        vscode.languages.registerCodeActionsProvider({ scheme: 'file' }, (0, ignoreComments_1.createIgnoreCodeActionProvider)(vscode), vscode.CodeActionKind ? { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] } : undefined),
        dashboardViewProvider,
        findingsProvider,
        statusBar,
        onSaveController,
        aiPreviewProvider,
        chatParticipant,
        securityRules,
    ];
    context.subscriptions.push(...disposables);
    void securityRules.initialize();
}
function deactivate() { }
module.exports = {
    activate,
    deactivate,
};
