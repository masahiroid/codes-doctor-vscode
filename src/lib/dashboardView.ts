import type { WebviewViewProvider } from 'vscode';
import { secureWebviewHtml } from './webviewSecurity';
import { createDashboardController } from './dashboard/controller';
import { CONFIGURATION_SECTION } from './settingsSchema';

/** VS Code adapter: view attachment, redraw and subscription disposal only. */
export class CodeDoctorDashboardViewProvider implements WebviewViewProvider {
  readonly controller: import('./dashboard/contracts').DashboardController;
  currentView: import('vscode').WebviewView | null = null;
  private readonly configListener: import('vscode').Disposable;
  private viewSubscriptions: import('vscode').Disposable[] = [];

  constructor(vscode: typeof import('vscode'), context: import('vscode').ExtensionContext) {
    this.controller = createDashboardController(vscode, context, () => this.render());
    this.configListener = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIGURATION_SECTION)) this.render();
    });
  }

  resolveWebviewView(view: import('vscode').WebviewView): void {
    for (const subscription of this.viewSubscriptions) subscription.dispose();
    this.currentView = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [] };
    this.viewSubscriptions = [
      view.webview.onDidReceiveMessage((input: unknown) => this.controller.handleMessage(input)),
      view.onDidDispose(() => { if (this.currentView === view) this.currentView = null; }),
    ];
    this.render();
  }

  render(): void {
    if (this.currentView) this.currentView.webview.html = secureWebviewHtml(this.controller.buildHtml(), this.currentView.webview.cspSource);
  }

  dispose(): void {
    this.configListener.dispose();
    for (const subscription of this.viewSubscriptions) subscription.dispose();
    this.viewSubscriptions = [];
    this.currentView = null;
  }
}

module.exports = { CodeDoctorDashboardViewProvider };
