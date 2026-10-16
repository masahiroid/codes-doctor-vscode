"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGitStatusPorcelain = parseGitStatusPorcelain;
exports.getGitChangedFiles = getGitChangedFiles;
exports.filterResultByChangedFiles = filterResultByChangedFiles;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const diagnostics_1 = require("./diagnostics");
function parseGitStatusPorcelain(output, repoPath) {
    const files = new Set();
    for (const rawLine of (output || '').split(/\r?\n/)) {
        if (rawLine.length < 4)
            continue;
        const status = rawLine.slice(0, 2);
        if (status.includes('D'))
            continue;
        let relPath = rawLine.slice(3).trim();
        const arrowIdx = relPath.indexOf(' -> ');
        if (arrowIdx !== -1) {
            relPath = relPath.slice(arrowIdx + 4).trim();
        }
        if (relPath.startsWith('"') && relPath.endsWith('"')) {
            relPath = relPath.slice(1, -1);
        }
        if (relPath) {
            files.add(node_path_1.default.resolve(repoPath, relPath));
        }
    }
    return Array.from(files);
}
function getGitChangedFiles(repoPath) {
    const statusOut = (0, node_child_process_1.execFileSync)('git', ['status', '--porcelain', '-uall'], {
        cwd: repoPath,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const uncommitted = parseGitStatusPorcelain(statusOut, repoPath).filter((p) => node_fs_1.default.existsSync(p));
    if (uncommitted.length > 0) {
        return uncommitted;
    }
    try {
        const diffOut = (0, node_child_process_1.execFileSync)('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD~1', 'HEAD'], {
            cwd: repoPath,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return diffOut
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((rel) => node_path_1.default.resolve(repoPath, rel))
            .filter((p) => node_fs_1.default.existsSync(p));
    }
    catch {
        return [];
    }
}
function filterResultByChangedFiles(result, changedFiles) {
    const changedAbsSet = new Set(changedFiles.map((f) => node_path_1.default.resolve(result.repoPath, f)));
    const changedBaseSet = new Set(changedFiles.map((f) => node_path_1.default.basename(f)));
    const isChanged = (filePath) => {
        const abs = node_path_1.default.resolve((0, diagnostics_1.resolveIssueFilePath)(result.repoPath, filePath));
        return changedAbsSet.has(abs);
    };
    let securityScore = result.securityScore;
    if (securityScore && Array.isArray(securityScore.issues)) {
        const issues = securityScore.issues.filter((i) => i.type === 'info' || isChanged(i.filePath));
        const prod = issues.filter((i) => !i.inTest);
        const summary = {
            critical: prod.filter((i) => i.type === 'critical').length,
            high: prod.filter((i) => i.type === 'high').length,
            medium: prod.filter((i) => i.type === 'medium').length,
            low: prod.filter((i) => i.type === 'low').length,
            info: prod.filter((i) => i.type === 'info').length,
        };
        securityScore = {
            ...securityScore,
            issues,
            summary,
        };
    }
    const godClasses = (result.godClasses || []).filter((gc) => isChanged(gc.filePath));
    const circularDependencies = (result.circularDependencies || []).filter((cd) => (cd.cycle || []).some((mod) => isChanged(mod) || changedBaseSet.has(node_path_1.default.basename(mod))));
    return {
        ...result,
        summary: {
            ...result.summary,
            totalFiles: changedAbsSet.size,
            totalClasses: godClasses.length,
        },
        securityScore,
        godClasses,
        circularDependencies,
    };
}
module.exports = {
    parseGitStatusPorcelain,
    getGitChangedFiles,
    filterResultByChangedFiles,
};
