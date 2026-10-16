import path from 'node:path';
import type * as vscodeTypes from 'vscode';
import { getDisplayLanguage } from './config';
import { resolveIssueFilePath } from './diagnostics';
import { translator } from './i18n';
import { getLastAnalysis } from './lastAnalysisState';
import { generateAdHocAiResponse } from './vscodeLm';

export const AI_PREVIEW_SCHEME = 'codedoctor-ai-preview';

const previewContents = new Map<string, string>();

export function setPreviewContent(key: string, content: string): void {
  previewContents.set(key, content);
}

export function getPreviewContent(key: string): string {
  return previewContents.get(key) || '';
}

export function extractCodeBlock(responseText: string): string {
  if (!responseText) return '';
  const fenceRegex = /```(?:[a-zA-Z0-9_+-]+)?\s*\r?\n([\s\S]*?)```/;
  const match = fenceRegex.exec(responseText);
  if (match && match[1]) {
    return match[1];
  }
  return responseText.trim();
}

export function buildAiFixPrompt(params: {
  filePath: string;
  fileContent: string;
  issueCategory?: string;
  issueDescription?: string;
  issueRecommendation?: string;
  lineOneBased?: number;
  selectedText?: string;
  displayLanguage?: 'en' | 'ja';
}): string {
  const langNote =
    params.displayLanguage === 'ja'
      ? 'Keep any new or updated code comments in natural Japanese where appropriate.'
      : 'Keep code comments clear and concise.';

  const targetDetails: string[] = [
    `File: ${path.basename(params.filePath)}`,
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

export function registerAiPreviewContentProvider(vscode: typeof import('vscode')): vscodeTypes.Disposable {
  if (!vscode.workspace?.registerTextDocumentContentProvider) {
    return { dispose: () => {} };
  }
  const emitter = vscode.EventEmitter ? new vscode.EventEmitter<vscodeTypes.Uri>() : undefined;
  const provider: vscodeTypes.TextDocumentContentProvider = {
    onDidChange: emitter?.event,
    provideTextDocumentContent(uri: vscodeTypes.Uri): string {
      return getPreviewContent(uri.path);
    },
  };
  return vscode.workspace.registerTextDocumentContentProvider(AI_PREVIEW_SCHEME, provider);
}

export interface AiFixOptions {
  documentUri?: vscodeTypes.Uri;
  diagnostic?: vscodeTypes.Diagnostic;
  lineOneBased?: number;
  category?: string;
}

export async function previewAndApplyAiFix(
  vscode: typeof import('vscode'),
  context: vscodeTypes.ExtensionContext,
  options?: AiFixOptions
): Promise<boolean> {
  const t = translator(vscode);
  const activeEditor = vscode.window?.activeTextEditor;
  const targetUri = options?.documentUri || activeEditor?.document?.uri;
  if (!targetUri || !targetUri.fsPath) {
    vscode.window.showErrorMessage(t('Open a source file in the editor first to preview an AI fix.'));
    return false;
  }

  const document =
    activeEditor?.document?.uri?.fsPath === targetUri.fsPath
      ? activeEditor.document
      : await vscode.workspace.openTextDocument(targetUri);

  const originalText = document.getText();
  const lineOneBased =
    options?.lineOneBased ||
    (options?.diagnostic ? options.diagnostic.range.start.line + 1 : undefined) ||
    (activeEditor ? activeEditor.selection.active.line + 1 : 1);

  const selectedText =
    activeEditor && !activeEditor.selection.isEmpty
      ? document.getText(activeEditor.selection)
      : undefined;

  let issueCategory =
    options?.category ||
    (typeof options?.diagnostic?.code === 'string' ? options.diagnostic.code : undefined);
  let issueDescription = options?.diagnostic?.message;
  let issueRecommendation: string | undefined;

  const last = getLastAnalysis();
  if (last?.result) {
    const absTarget = path.resolve(targetUri.fsPath);
    const matchingIssue = (last.result.securityScore?.issues || []).find((iss) => {
      const issAbs = path.resolve(resolveIssueFilePath(last.result!.repoPath, iss.filePath));
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
    displayLanguage: getDisplayLanguage(vscode),
  });

  let proposedContent = '';
  let providerLabel = '';

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: t('Codes Doctor: Generating AI fix preview...'),
        cancellable: true,
      },
      async (_progress, token) => {
        const res = await generateAdHocAiResponse(vscode, context, prompt, token);
        providerLabel = res.providerLabel;
        proposedContent = extractCodeBlock(res.text);
      }
    );
  } catch (err) {
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
  const previewUri = vscode.Uri.parse(`${AI_PREVIEW_SCHEME}:${previewKey}?ts=${Date.now()}`);
  const diffTitle = t('Codes Doctor AI Fix Preview: {file} ({provider})', {
    file: path.basename(targetUri.fsPath),
    provider: providerLabel,
  });

  await vscode.commands.executeCommand('vscode.diff', targetUri, previewUri, diffTitle);

  const applyLabel = t('Apply Fix');
  const discardLabel = t('Discard');
  const choice = await vscode.window.showInformationMessage(
    t('Review the proposed AI fix in the diff editor. Apply changes to {file}?', {
      file: path.basename(targetUri.fsPath),
    }),
    applyLabel,
    discardLabel
  );

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
      vscode.window.showInformationMessage(
        t('Applied AI fix to {file}.', { file: path.basename(targetUri.fsPath) })
      );
      return true;
    }
  }

  return false;
}

module.exports = {
  AI_PREVIEW_SCHEME,
  setPreviewContent,
  getPreviewContent,
  extractCodeBlock,
  buildAiFixPrompt,
  registerAiPreviewContentProvider,
  previewAndApplyAiFix,
};

