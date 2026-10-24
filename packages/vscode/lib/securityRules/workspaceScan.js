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
 * scanned; files in languages no rule supports are counted as well. Data-flow rules first summarize
 * every function of the scanned files, so a call into another file is followed; the summaries are
 * returned for scanning single files later. Returns undefined when cancelled.
 */
async function scanWorkspaceFiles(vscode, options) {
    const { root, rules, engine, progress, token } = options;
    const uris = await vscode.workspace.findFiles(scan_1.SCAN_GLOB, scan_1.SCAN_EXCLUDE_GLOB, 20000);
    const unsupported = (await vscode.workspace.findFiles(scan_1.UNSUPPORTED_SOURCE_GLOB, scan_1.SCAN_EXCLUDE_GLOB, 5000)).length;
    const scan = { results: [], scanned: 0, skipped: 0, tests: 0, unsupported, filesByLanguage: {} };
    const selected = [];
    for (const uri of uris) {
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
            if ((await promises_1.default.stat(uri.fsPath)).size > scan_1.SCAN_LIMITS.maxFileBytes) {
                scan.skipped++;
                continue;
            }
        }
        catch {
            scan.skipped++;
            continue;
        }
        selected.push({ uri, language, relative });
    }
    const flowRules = (0, scan_1.flowRulesOf)(rules);
    if (engine && flowRules.length > 0) {
        progress?.report({ message: options.labels?.summarizing });
        const read = async (file) => {
            if (token?.isCancellationRequested)
                throw new Error('cancelled');
            return promises_1.default.readFile(file, 'utf8');
        };
        scan.index = await engine.buildTaintRuleIndex(flowRules.map((item) => item.taint), selected.map((file) => ({ path: file.uri.fsPath, language: file.language })), read);
    }
    let total = 0;
    for (const [position, { uri, language, relative }] of selected.entries()) {
        if (token?.isCancellationRequested)
            return undefined;
        if (position % 25 === 0) {
            progress?.report({ message: `${options.labels?.scanning ?? ''} ${position}/${selected.length}`.trim(), increment: (25 / Math.max(selected.length, 1)) * 100 });
        }
        try {
            const endpoints = new Map();
            const candidates = await (0, scan_1.scanFile)(await promises_1.default.readFile(uri.fsPath, 'utf8'), language, uri.fsPath, rules, engine, scan.index, endpoints);
            scan.scanned++;
            scan.filesByLanguage[language] = (scan.filesByLanguage[language] ?? 0) + 1;
            if (candidates.length === 0 && endpoints.size === 0)
                continue;
            if (candidates.length > 0)
                options.onFindings(uri, candidates);
            scan.results.push({ file: relative, candidates, ...(endpoints.size > 0 ? { endpoints: Object.fromEntries(endpoints) } : {}) });
            total += candidates.length;
            if (total >= scan_1.SCAN_LIMITS.maxTotalCandidates)
                break;
        }
        catch {
            scan.skipped++;
        }
    }
    return token?.isCancellationRequested ? undefined : scan;
}
module.exports = { scanWorkspaceFiles };
