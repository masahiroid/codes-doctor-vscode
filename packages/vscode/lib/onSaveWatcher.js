"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOnSaveController = createOnSaveController;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const analyzer_1 = require("./analyzer");
const config_1 = require("./config");
const lastAnalysisState_1 = require("./lastAnalysisState");
const diagnostics_1 = require("./diagnostics");
const ignoreComments_1 = require("./ignoreComments");
const summary_1 = require("./summary");
function createOnSaveController(vscode, context, diagnosticCollection, debounceMs = 500) {
    let timer;
    let running = false;
    async function handleDocumentSaved(document) {
        if (!document?.uri?.fsPath)
            return;
        // 1. Immediately re-evaluate inline ignore comments against existing analysis results
        const current = (0, lastAnalysisState_1.getLastAnalysis)();
        if (current?.result) {
            const filtered = (0, ignoreComments_1.applyIgnoreComments)(current.result);
            const minSecurity = (0, config_1.getMinSecurity)(vscode);
            const minTechnicalDebt = (0, config_1.getMinTechnicalDebt)(vscode);
            const summary = (0, summary_1.summarize)(filtered, current.reportPath || '', { minSecurity, minTechnicalDebt });
            (0, lastAnalysisState_1.setLastAnalysis)(current.analysisId, current.outputDir, current.reportPath, summary, filtered);
            (0, diagnostics_1.updateDiagnostics)(vscode, diagnosticCollection, filtered);
        }
        // 2. If analyzeOnSave is enabled, run a quiet background workspace analysis
        if (!(0, config_1.getAnalyzeOnSave)(vscode))
            return;
        const folders = vscode.workspace?.workspaceFolders;
        if (!folders || folders.length === 0)
            return;
        const savedPath = node_path_1.default.resolve(document.uri.fsPath);
        const targetFolder = folders.find((f) => savedPath.startsWith(node_path_1.default.resolve(f.uri.fsPath))) || folders[0];
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(async () => {
            if (running)
                return;
            running = true;
            try {
                const customDir = (0, config_1.getCustomOutputDir)(vscode);
                const outputDir = customDir
                    ? node_path_1.default.isAbsolute(customDir)
                        ? customDir
                        : node_path_1.default.resolve(targetFolder.uri.fsPath, customDir)
                    : (0, analyzer_1.getDefaultOutputDir)(context);
                node_fs_1.default.mkdirSync(outputDir, { recursive: true });
                const analysis = await (0, analyzer_1.analyzeWorkspace)(targetFolder.uri.fsPath, (0, config_1.getAnalysisLanguage)(vscode), outputDir, (0, config_1.getDisplayLanguage)(vscode));
                const filtered = (0, ignoreComments_1.applyIgnoreComments)(analysis.result);
                const minSecurity = (0, config_1.getMinSecurity)(vscode);
                const minTechnicalDebt = (0, config_1.getMinTechnicalDebt)(vscode);
                const summary = (0, summary_1.summarize)(filtered, analysis.reportPath, { minSecurity, minTechnicalDebt });
                (0, lastAnalysisState_1.setLastAnalysis)(analysis.analysisId, outputDir, analysis.reportPath, summary, filtered);
                (0, diagnostics_1.updateDiagnostics)(vscode, diagnosticCollection, filtered);
            }
            catch {
                // Silent background run: do not interrupt coding with error modals on every save.
            }
            finally {
                running = false;
            }
        }, debounceMs);
    }
    const sub = vscode.workspace?.onDidSaveTextDocument
        ? vscode.workspace.onDidSaveTextDocument((doc) => {
            void handleDocumentSaved(doc);
        })
        : { dispose: () => { } };
    return {
        handleDocumentSaved,
        dispose() {
            if (timer)
                clearTimeout(timer);
            sub.dispose();
        },
    };
}
module.exports = {
    createOnSaveController,
};
