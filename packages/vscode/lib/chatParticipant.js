"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHAT_PARTICIPANT_ID = void 0;
exports.buildChatContextSummary = buildChatContextSummary;
exports.handleChatRequest = handleChatRequest;
exports.registerChatParticipant = registerChatParticipant;
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("./config");
const i18n_1 = require("./i18n");
const lastAnalysisState_1 = require("./lastAnalysisState");
const settingsSchema_1 = require("./settingsSchema");
const summary_1 = require("./summary");
const vscodeLm_1 = require("./vscodeLm");
exports.CHAT_PARTICIPANT_ID = 'codeDoctor.participant';
function buildChatContextSummary(last, activeFilePath, selectedText) {
    const sections = [];
    if (last?.summary) {
        sections.push('=== Codes Doctor Latest Analysis Summary ===');
        sections.push((0, summary_1.formatSummary)(last.summary));
    }
    if (last?.result) {
        const res = last.result;
        const issues = (res.securityScore?.issues || []).filter((i) => i.type !== 'info' && !i.inTest);
        if (issues.length > 0) {
            sections.push('\n=== Top Security Findings ===');
            for (const iss of issues.slice(0, 12)) {
                const flowTag = iss.confidence === 'flow' ? '[TRACED FLOW]' : '[PATTERN]';
                const flowDetail = iss.flow
                    ? ` | Flow: L${iss.flow.source.line} (${iss.flow.source.code.trim()}) -> L${iss.flow.sink.line} (${iss.flow.sink.code.trim()})`
                    : '';
                sections.push(`- ${flowTag} [${iss.type.toUpperCase()}] ${iss.category} at ${iss.filePath}:${iss.lineNumber} — ${iss.description} (Recommendation: ${iss.recommendation})${flowDetail}`);
            }
        }
        const godClasses = (res.godClasses || []).slice(0, 8);
        if (godClasses.length > 0) {
            sections.push('\n=== Top God Classes ===');
            for (const gc of godClasses) {
                sections.push(`- ${gc.className} (${gc.filePath}): score=${gc.godScore} [${gc.rank}], lines=${gc.lineCount}, methods=${gc.methodCount}, props=${gc.propertyCount}, imports=${gc.importCount}`);
            }
        }
        const cycles = (res.circularDependencies || []).slice(0, 5);
        if (cycles.length > 0) {
            sections.push('\n=== Circular Dependencies ===');
            for (const c of cycles) {
                sections.push(`- ${(c.cycle || []).join(' -> ')}`);
            }
        }
    }
    if (activeFilePath) {
        sections.push(`\nActive Editor File: ${node_path_1.default.basename(activeFilePath)} (${activeFilePath})`);
    }
    if (selectedText) {
        sections.push(`\nSelected Code in Editor:\n\`\`\`\n${selectedText.slice(0, 3000)}\n\`\`\``);
    }
    return sections.join('\n');
}
async function handleChatRequest(vscode, context, request, stream, token) {
    const t = (0, i18n_1.translator)(vscode);
    const lang = (0, config_1.getDisplayLanguage)(vscode);
    const cmd = request.command || 'chat';
    const last = (0, lastAnalysisState_1.getLastAnalysis)();
    const activeEditor = vscode.window?.activeTextEditor;
    const activeFilePath = activeEditor?.document?.uri?.fsPath;
    const selectedText = activeEditor && !activeEditor.selection.isEmpty
        ? activeEditor.document.getText(activeEditor.selection)
        : undefined;
    if (!last?.result) {
        stream.markdown(t('No Codes Doctor analysis has been run in this session yet. Click below to analyze the current workspace first:') + '\n\n');
        stream.button({
            command: settingsSchema_1.COMMANDS.analyzeCurrentWorkspace,
            title: t('Analyze Current Workspace'),
        });
        return { metadata: { command: cmd } };
    }
    if (cmd === 'analyze') {
        stream.markdown(`### 🩺 Codes Doctor Summary\n\n\`\`\`text\n${(0, summary_1.formatSummary)(last.summary)}\n\`\`\`\n\n`);
        stream.button({
            command: settingsSchema_1.COMMANDS.openLastReport,
            title: t('Open Report'),
        });
        stream.button({
            command: settingsSchema_1.COMMANDS.analyzeGitChanges,
            title: t('Analyze Git Changes'),
        });
        if (!request.prompt.trim()) {
            return { metadata: { command: cmd } };
        }
    }
    if (cmd === 'fix' && activeEditor) {
        stream.markdown(t('Click the button below to generate an AI fix and open a side-by-side Diff Preview in the editor:') +
            '\n\n');
        stream.button({
            command: settingsSchema_1.COMMANDS.previewAiFix,
            title: t('Codes Doctor: Preview AI Fix in Diff Editor'),
            arguments: [{ documentUri: activeEditor.document.uri }],
        });
    }
    stream.progress(t('Consulting AI model with Codes Doctor analysis context...'));
    const contextBlock = buildChatContextSummary(last, activeFilePath, selectedText);
    const languageDirective = lang === 'ja' ? 'Respond in clear, professional Japanese (日本語).' : 'Respond in clear, concise English.';
    let roleFocus = 'Answer the developer\'s question using the Codes Doctor structural & security analysis context.';
    if (cmd === 'security') {
        roleFocus =
            'Focus on the reported security findings (especially [TRACED FLOW] vulnerabilities). Explain the attack path (source -> sink) and provide concrete, safe code remediation.';
    }
    else if (cmd === 'refactor') {
        roleFocus =
            'Focus on the top God Classes and Circular Dependencies. Propose a concrete, step-by-step responsibility split and module decoupling plan.';
    }
    else if (cmd === 'fix') {
        roleFocus =
            'Provide a concrete code fix for the active file/selection or top reported issue, and explain why the fix resolves the vulnerability or structural smell.';
    }
    const fullPrompt = [
        'You are @codedoctor, the AI software architecture and security assistant for the Codes Doctor VS Code extension.',
        roleFocus,
        languageDirective,
        '',
        contextBlock,
        '',
        `User request: ${request.prompt || (cmd === 'security' ? 'Explain the security findings and how to fix them.' : cmd === 'refactor' ? 'Propose a refactoring plan for the God Classes and circular dependencies.' : 'Summarize the key priorities.')}`,
    ].join('\n');
    try {
        const { text } = await (0, vscodeLm_1.generateAdHocAiResponse)(vscode, context, fullPrompt, token);
        stream.markdown(text);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stream.markdown(`⚠️ **${t('AI request failed')}:** ${message}`);
    }
    return { metadata: { command: cmd } };
}
function registerChatParticipant(vscode, context) {
    const anyVscode = vscode;
    if (!anyVscode.chat || typeof anyVscode.chat.createChatParticipant !== 'function') {
        return { dispose: () => { } };
    }
    const t = (0, i18n_1.translator)(vscode);
    const participant = anyVscode.chat.createChatParticipant(exports.CHAT_PARTICIPANT_ID, (request, _chatContext, stream, token) => handleChatRequest(vscode, context, request, stream, token));
    if (vscode.Uri?.file && context.extensionPath) {
        participant.iconPath = vscode.Uri.file(node_path_1.default.join(context.extensionPath, 'media', 'icon.png'));
    }
    participant.followupProvider = {
        provideFollowups() {
            return [
                {
                    command: 'security',
                    prompt: t('Explain traced security vulnerabilities and remediation'),
                    label: t('🛡️ Security Findings'),
                },
                {
                    command: 'refactor',
                    prompt: t('Propose a refactoring plan for God Classes'),
                    label: t('🏛️ God Class Refactoring'),
                },
                {
                    command: 'fix',
                    prompt: t('Generate a fix for the current file'),
                    label: t('✨ Preview AI Fix'),
                },
            ];
        },
    };
    return participant;
}
module.exports = {
    CHAT_PARTICIPANT_ID: exports.CHAT_PARTICIPANT_ID,
    buildChatContextSummary,
    handleChatRequest,
    registerChatParticipant,
};
