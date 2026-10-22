"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanWorkspaceFiles = scanWorkspaceFiles;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = __importDefault(require("node:fs/promises"));
const scan_1 = require("./scan");
/**
 * Scan the workspace files the rules can read. Test code and oversized files are counted, not
 * scanned; files in languages no rule supports are counted as well. Returns undefined when cancelled.
 */
async function scanWorkspaceFiles(vscode, options) {
    const { root, rules, engine, progress, token } = options;
    const uris = await vscode.workspace.findFiles(scan_1.SCAN_GLOB, scan_1.SCAN_EXCLUDE_GLOB, 20000);
    const unsupported = (await vscode.workspace.findFiles(scan_1.UNSUPPORTED_SOURCE_GLOB, scan_1.SCAN_EXCLUDE_GLOB, 5000)).length;
    const scan = { results: [], scanned: 0, skipped: 0, tests: 0, unsupported, filesByLanguage: {} };
    let total = 0;
    for (const [index, uri] of uris.entries()) {
        if (token?.isCancellationRequested)
            return undefined;
        if (index % 25 === 0)
            progress?.report({ message: `${index}/${uris.length}`, increment: (25 / Math.max(uris.length, 1)) * 100 });
        const language = (0, scan_1.languageForFile)(uri.fsPath);
        if (!language)
            continue;
        const relative = node_path_1.default.relative(root, uri.fsPath).split(node_path_1.default.sep).join('/');
        // Test code is not reachable from outside, and its deliberate unsafe calls were most of the noise.
        if (engine?.isTestPath(relative)) {
            scan.tests++;
            continue;
        }
        try {
            const stat = await promises_1.default.stat(uri.fsPath);
            if (stat.size > scan_1.SCAN_LIMITS.maxFileBytes) {
                scan.skipped++;
                continue;
            }
            const candidates = await (0, scan_1.scanFile)(await promises_1.default.readFile(uri.fsPath, 'utf8'), language, uri.fsPath, rules, engine);
            scan.scanned++;
            scan.filesByLanguage[language] = (scan.filesByLanguage[language] ?? 0) + 1;
            if (candidates.length === 0)
                continue;
            options.onFindings(uri, candidates);
            scan.results.push({ file: relative, candidates });
            total += candidates.length;
            if (total >= scan_1.SCAN_LIMITS.maxTotalCandidates)
                break;
        }
        catch {
            scan.skipped++;
        }
    }
    return scan;
}
module.exports = { scanWorkspaceFiles };
