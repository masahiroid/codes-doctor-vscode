"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseIgnoreComments = parseIgnoreComments;
exports.isIssueIgnored = isIssueIgnored;
exports.applyIgnoreComments = applyIgnoreComments;
exports.createIgnoreCodeActionProvider = createIgnoreCodeActionProvider;
const node_fs_1 = __importDefault(require("node:fs"));
const diagnostics_1 = require("./diagnostics");
const i18n_1 = require("./i18n");
const IGNORE_FILE_RE = /(?:\/\/|#|\/\*+|\*)\s*code-doctor-(?:ignore|disable)-file\b/i;
const IGNORE_NEXT_LINE_RE = /(?:\/\/|#|\/\*+)\s*code-doctor-(?:ignore|disable)-next-line(?:\s+([^\r\n*]+))?/i;
const IGNORE_LINE_RE = /(?:\/\/|#|\/\*+)\s*code-doctor-(?:ignore|disable)(?:-line)?(?:\s+([^\r\n*]+))?$/i;
function addRule(map, lineOneBased, rawCategories) {
    const set = map.get(lineOneBased) || new Set();
    const trimmed = (rawCategories || '').replace(/\*+\/\s*$/, '').trim();
    if (!trimmed) {
        set.add('*');
    }
    else {
        for (const part of trimmed.split(',')) {
            const cat = part.trim().toLowerCase();
            if (cat)
                set.add(cat);
        }
    }
    map.set(lineOneBased, set);
}
function parseIgnoreComments(content) {
    const ignoredLines = new Map();
    if (!content)
        return { ignoreFile: false, ignoredLines };
    if (IGNORE_FILE_RE.test(content)) {
        return { ignoreFile: true, ignoredLines };
    }
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const nextMatch = IGNORE_NEXT_LINE_RE.exec(line);
        if (nextMatch) {
            addRule(ignoredLines, lineNum + 1, nextMatch[1]);
            continue;
        }
        const sameMatch = IGNORE_LINE_RE.exec(line);
        if (sameMatch && !/code-doctor-(?:ignore|disable)-(?:next-line|file)/i.test(line)) {
            addRule(ignoredLines, lineNum, sameMatch[1]);
        }
    }
    return { ignoreFile: false, ignoredLines };
}
function isIssueIgnored(rules, lineOneBased, category) {
    if (rules.ignoreFile)
        return true;
    if (!lineOneBased)
        return false;
    const set = rules.ignoredLines.get(lineOneBased);
    if (!set)
        return false;
    if (set.has('*'))
        return true;
    if (category && set.has(category.toLowerCase()))
        return true;
    return false;
}
/**
 * Filter out security issues and God Classes suppressed by inline ignore comments.
 */
function applyIgnoreComments(result, fileContentMap) {
    const rulesCache = new Map();
    const getRules = (absPath) => {
        const cached = rulesCache.get(absPath);
        if (cached)
            return cached;
        let content = fileContentMap?.get(absPath);
        if (content === undefined) {
            try {
                content = node_fs_1.default.readFileSync(absPath, 'utf8');
            }
            catch {
                content = '';
            }
        }
        const parsed = parseIgnoreComments(content);
        rulesCache.set(absPath, parsed);
        return parsed;
    };
    let securityScore = result.securityScore;
    if (securityScore && Array.isArray(securityScore.issues)) {
        const filteredIssues = securityScore.issues.filter((issue) => {
            if (issue.type === 'info')
                return true;
            const absPath = (0, diagnostics_1.resolveIssueFilePath)(result.repoPath, issue.filePath);
            const rules = getRules(absPath);
            return !isIssueIgnored(rules, issue.lineNumber, issue.category);
        });
        const prod = filteredIssues.filter((i) => !i.inTest);
        const summary = {
            critical: prod.filter((i) => i.type === 'critical').length,
            high: prod.filter((i) => i.type === 'high').length,
            medium: prod.filter((i) => i.type === 'medium').length,
            low: prod.filter((i) => i.type === 'low').length,
            info: prod.filter((i) => i.type === 'info').length,
        };
        securityScore = {
            ...securityScore,
            issues: filteredIssues,
            summary,
        };
    }
    const godClasses = (result.godClasses || []).filter((gc) => {
        const absPath = (0, diagnostics_1.resolveIssueFilePath)(result.repoPath, gc.filePath);
        const rules = getRules(absPath);
        return !rules.ignoreFile && !isIssueIgnored(rules, 1, 'god class');
    });
    return {
        ...result,
        securityScore,
        godClasses,
    };
}
function createIgnoreCodeActionProvider(vscode) {
    return {
        provideCodeActions(document, _range, context) {
            if (!context?.diagnostics)
                return [];
            const t = (0, i18n_1.translator)(vscode);
            const actions = [];
            for (const diag of context.diagnostics) {
                if (diag.source !== 'Codes Doctor')
                    continue;
                const lineIdx = diag.range.start.line;
                const lineText = document.lineAt ? document.lineAt(lineIdx).text : '';
                const indentMatch = /^(\s*)/.exec(lineText);
                const indent = indentMatch ? indentMatch[1] : '';
                const codeStr = typeof diag.code === 'string' ? diag.code : '';
                if (codeStr === 'God Class') {
                    const action = new vscode.CodeAction(t('Codes Doctor: Ignore God Class in this file'), vscode.CodeActionKind?.QuickFix);
                    const edit = new vscode.WorkspaceEdit();
                    edit.insert(document.uri, new vscode.Position(0, 0), `// code-doctor-ignore-file\n`);
                    action.edit = edit;
                    action.diagnostics = [diag];
                    actions.push(action);
                }
                else {
                    const comment = codeStr
                        ? `${indent}// code-doctor-ignore-next-line ${codeStr}\n`
                        : `${indent}// code-doctor-ignore-next-line\n`;
                    const action = new vscode.CodeAction(t('Codes Doctor: Ignore on this line ({category})', { category: codeStr || 'issue' }), vscode.CodeActionKind?.QuickFix);
                    const edit = new vscode.WorkspaceEdit();
                    edit.insert(document.uri, new vscode.Position(lineIdx, 0), comment);
                    action.edit = edit;
                    action.diagnostics = [diag];
                    actions.push(action);
                }
                const aiFixAction = new vscode.CodeAction(t('Codes Doctor: Generate & Preview AI Fix ({category})', { category: codeStr || 'issue' }), vscode.CodeActionKind?.QuickFix);
                aiFixAction.command = {
                    command: 'codeDoctor.previewAiFix',
                    title: t('Codes Doctor: Generate & Preview AI Fix ({category})', { category: codeStr || 'issue' }),
                    arguments: [{ documentUri: document.uri, diagnostic: diag }],
                };
                aiFixAction.diagnostics = [diag];
                aiFixAction.isPreferred = true;
                actions.push(aiFixAction);
            }
            return actions;
        },
    };
}
module.exports = {
    parseIgnoreComments,
    isIssueIgnored,
    applyIgnoreComments,
    createIgnoreCodeActionProvider,
};
