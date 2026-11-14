"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanWorkspaceFiles = scanWorkspaceFiles;
const rules_1 = require("./rules");
/** The workspace's file list from VS Code's file search, scanned by the engine's shared loop. */
async function scanWorkspaceFiles(vscode, options) {
    const { SCAN_EXCLUDE_GLOB, SCAN_GLOB, UNSUPPORTED_SOURCE_GLOB, scanFiles } = (0, rules_1.rulesModule)();
    const uris = await vscode.workspace.findFiles(SCAN_GLOB, SCAN_EXCLUDE_GLOB, 20000);
    const unsupported = (await vscode.workspace.findFiles(UNSUPPORTED_SOURCE_GLOB, SCAN_EXCLUDE_GLOB, 5000)).length;
    const byPath = new Map(uris.map((uri) => [uri.fsPath, uri]));
    return scanFiles({
        root: options.root,
        files: uris.map((uri) => uri.fsPath),
        unsupported,
        rules: options.rules,
        engine: options.engine,
        onFindings: (file, candidates) => {
            const uri = byPath.get(file);
            if (uri)
                options.onFindings(uri, candidates);
        },
        progress: options.progress,
        token: options.token,
        labels: options.labels,
    });
}
module.exports = { scanWorkspaceFiles };
