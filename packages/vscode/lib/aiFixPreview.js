"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_PREVIEW_SCHEME = void 0;
exports.setPreviewContent = setPreviewContent;
exports.getPreviewContent = getPreviewContent;
exports.extractCodeBlock = extractCodeBlock;
exports.buildAiFixPrompt = buildAiFixPrompt;
exports.registerAiPreviewContentProvider = registerAiPreviewContentProvider;
exports.previewAndApplyAiFix = previewAndApplyAiFix;
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("./config");
const diagnostics_1 = require("./diagnostics");
const i18n_1 = require("./i18n");
const lastAnalysisState_1 = require("./lastAnalysisState");
const vscodeLm_1 = require("./vscodeLm");
exports.AI_PREVIEW_SCHEME = 'codedoctor-ai-preview';
const previewContents = new Map();
function setPreviewContent(key, content) {
    previewContents.set(key, content);
}
function getPreviewContent(key) {
    return previewContents.get(key) || '';
}
function extractCodeBlock(responseText) {
    if (!responseText)
        return '';
    const fenceRegex = /```(?:[a-zA-Z0-9_+-]+)?\s*\r?\n([\s\S]*?)```/;
    const match = fenceRegex.exec(responseText);
    if (match && match[1]) {
        return match[1];
    }
    return responseText.trim();
}
function buildAiFixPrompt(params) {
    const langNote = params.displayLanguage === 'ja'
        ? 'Keep any new or updated code comments in natural Japanese where appropriate.'
        : 'Keep code comments clear and concise.';
    const targetDetails = [
        `File: ${node_path_1.default.basename(params.filePath)}`,
    ];
    if (params.lineOneBased) {
        targetDetails.push(`Target line: ${params.lineOneBased}`);
    }
    if (params.issueCategory) {
        targetDetails.push(`Finding category: ${params.issueCategory}`);
    }
    if (params.issueDescription) {
        targetDetails.push(`Finding details: ${params.issueDescription}`);
    }
    if (params.issueRecommendation) {
        targetDetails.push(`Recommended remediation: ${params.issueRecommendation}`);
    }
    if (params.selectedText) {
        targetDetails.push(`Selected snippet:\n${params.selectedText}`);
    }
    return [
        'You are an expert security and software architecture refactoring assistant integrated into Codes Doctor.',
        'Fix the reported security vulnerability or structural code quality issue in the file below.',
        'Rules:',
        '1. Preserve all existing public exports, function signatures, and unrelated logic.',
        '2. Fix the specific security risk (e.g., use parameterized queries, argument arrays instead of shell strings, output escaping, path validation) or structural smell cleanly.',
        `3. ${langNote}`,
        '4. Output ONLY the complete updated file content wrapped in a single fenced code block (```...```). Do not omit any lines with placeholders like "// ... existing code".',
        '',
        ...targetDetails,
        '',
        'Original file content:',
        '```',
        params.fileContent,
        '```',
    ].join('\n');
}
function registerAiPreviewContentProvider(vscode) {
    if (!vscode.workspace?.registerTextDocumentContentProvider) {
        return { dispose: () => { } };
    }
    const emitter = vscode.EventEmitter ? new vscode.EventEmitter() : undefined;
    const provider = {
        onDidChange: emitter?.event,
        provideTextDocumentContent(uri) {
            return getPreviewContent(uri.path);
        },
    };
    return vscode.workspace.registerTextDocumentContentProvider(exports.AI_PREVIEW_SCHEME, provider);
}
async function previewAndApplyAiFix(vscode, context, options) {
    const t = (0, i18n_1.translator)(vscode);
    const activeEditor = vscode.window?.activeTextEditor;
    const targetUri = options?.documentUri || activeEditor?.document?.uri;
    if (!targetUri || !targetUri.fsPath) {
        vscode.window.showErrorMessage(t('Open a source file in the editor first to preview an AI fix.'));
        return false;
    }
    const document = activeEditor?.document?.uri?.fsPath === targetUri.fsPath
        ? activeEditor.document
        : await vscode.workspace.openTextDocument(targetUri);
    const originalText = document.getText();
    const lineOneBased = options?.lineOneBased ||
        (options?.diagnostic ? options.diagnostic.range.start.line + 1 : undefined) ||
        (activeEditor ? activeEditor.selection.active.line + 1 : 1);
    const selectedText = activeEditor && !activeEditor.selection.isEmpty
        ? document.getText(activeEditor.selection)
        : undefined;
    let issueCategory = options?.category ||
        (typeof options?.diagnostic?.code === 'string' ? options.diagnostic.code : undefined);
    let issueDescription = options?.diagnostic?.message;
    let issueRecommendation;
    const last = (0, lastAnalysisState_1.getLastAnalysis)();
    if (last?.result) {
        const absTarget = node_path_1.default.resolve(targetUri.fsPath);
        const matchingIssue = (last.result.securityScore?.issues || []).find((iss) => {
            const issAbs = node_path_1.default.resolve((0, diagnostics_1.resolveIssueFilePath)(last.result.repoPath, iss.filePath));
            return issAbs === absTarget && iss.lineNumber === lineOneBased;
        });
        if (matchingIssue) {
            issueCategory = issueCategory || matchingIssue.category;
            issueDescription = matchingIssue.description;
            issueRecommendation = matchingIssue.recommendation;
        }
    }
    const prompt = buildAiFixPrompt({
        filePath: targetUri.fsPath,
        fileContent: originalText,
        issueCategory,
        issueDescription,
        issueRecommendation,
        lineOneBased,
        selectedText,
        displayLanguage: (0, config_1.getDisplayLanguage)(vscode),
    });
    let proposedContent = '';
    let providerLabel = '';
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t('Codes Doctor: Generating AI fix preview...'),
            cancellable: true,
        }, async (_progress, token) => {
            const res = await (0, vscodeLm_1.generateAdHocAiResponse)(vscode, context, prompt, token);
            providerLabel = res.providerLabel;
            proposedContent = extractCodeBlock(res.text);
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(t('Could not generate AI fix: {message}', { message }));
        return false;
    }
    if (!proposedContent || proposedContent.trim() === originalText.trim()) {
        vscode.window.showInformationMessage(t('AI did not propose any code changes for this location.'));
        return false;
    }
    // Ensure trailing newline matches original if present
    if (originalText.endsWith('\n') && !proposedContent.endsWith('\n')) {
        proposedContent += '\n';
    }
    const previewKey = targetUri.fsPath;
    setPreviewContent(previewKey, proposedContent);
    const previewUri = vscode.Uri.parse(`${exports.AI_PREVIEW_SCHEME}:${previewKey}?ts=${Date.now()}`);
    const diffTitle = t('Codes Doctor AI Fix Preview: {file} ({provider})', {
        file: node_path_1.default.basename(targetUri.fsPath),
        provider: providerLabel,
    });
    await vscode.commands.executeCommand('vscode.diff', targetUri, previewUri, diffTitle);
    const applyLabel = t('Apply Fix');
    const discardLabel = t('Discard');
    const choice = await vscode.window.showInformationMessage(t('Review the proposed AI fix in the diff editor. Apply changes to {file}?', {
        file: node_path_1.default.basename(targetUri.fsPath),
    }), applyLabel, discardLabel);
    if (choice === applyLabel) {
        const edit = new vscode.WorkspaceEdit();
        const lineCount = typeof document.lineCount === 'number' ? document.lineCount : originalText.split(/\r?\n/).length;
        const fullRange = new vscode.Range(0, 0, lineCount, 0);
        edit.replace(targetUri, fullRange, proposedContent);
        const applied = await vscode.workspace.applyEdit(edit);
        if (applied) {
            if (typeof document.save === 'function') {
                await document.save();
            }
            vscode.window.showInformationMessage(t('Applied AI fix to {file}.', { file: node_path_1.default.basename(targetUri.fsPath) }));
            return true;
        }
    }
    return false;
}
module.exports = {
    AI_PREVIEW_SCHEME: exports.AI_PREVIEW_SCHEME,
    setPreviewContent,
    getPreviewContent,
    extractCodeBlock,
    buildAiFixPrompt,
    registerAiPreviewContentProvider,
    previewAndApplyAiFix,
};
