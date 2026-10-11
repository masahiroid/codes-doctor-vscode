"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeDoctorDashboardViewProvider = void 0;
const webviewSecurity_1 = require("./webviewSecurity");
const controller_1 = require("./dashboard/controller");
const settingsSchema_1 = require("./settingsSchema");
/** VS Code adapter: view attachment, redraw and subscription disposal only. */
class CodeDoctorDashboardViewProvider {
    controller;
    currentView = null;
    configListener;
    viewSubscriptions = [];
    constructor(vscode, context) {
        this.controller = (0, controller_1.createDashboardController)(vscode, context, () => this.render());
        this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(settingsSchema_1.CONFIGURATION_SECTION))
                this.render();
        });
    }
    resolveWebviewView(view) {
        for (const subscription of this.viewSubscriptions)
            subscription.dispose();
        this.currentView = view;
        view.webview.options = { enableScripts: true, localResourceRoots: [] };
        this.viewSubscriptions = [
            view.webview.onDidReceiveMessage((input) => this.controller.handleMessage(input)),
            view.onDidDispose(() => { if (this.currentView === view)
                this.currentView = null; }),
        ];
        this.render();
    }
    render() {
        if (this.currentView)
            this.currentView.webview.html = (0, webviewSecurity_1.secureWebviewHtml)(this.controller.buildHtml(), this.currentView.webview.cspSource);
    }
    dispose() {
        this.configListener.dispose();
        for (const subscription of this.viewSubscriptions)
            subscription.dispose();
        this.viewSubscriptions = [];
        this.currentView = null;
    }
}
exports.CodeDoctorDashboardViewProvider = CodeDoctorDashboardViewProvider;
module.exports = { CodeDoctorDashboardViewProvider };
