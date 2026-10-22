import path from 'node:path';
import fs from 'node:fs/promises';
import { SCAN_EXCLUDE_GLOB, SCAN_GLOB, SCAN_LIMITS, UNSUPPORTED_SOURCE_GLOB, languageForFile, scanFile } from './scan';
import type { Candidate, CompiledRule, FlowEngine } from './scan';
import type { FileCandidates } from './audit';

export type ScanProgress = { report(value: { message?: string; increment?: number }): void };
export type ScanToken = { isCancellationRequested: boolean };

/** What a workspace scan found and what it covered, so an empty result can be read correctly. */
export interface WorkspaceScan {
  results: FileCandidates[];
  scanned: number;
  skipped: number;
  tests: number;
  unsupported: number;
  filesByLanguage: Record<string, number>;
}

/**
 * Scan the workspace files the rules can read. Test code and oversized files are counted, not
 * scanned; files in languages no rule supports are counted as well. Returns undefined when cancelled.
 */
export async function scanWorkspaceFiles(vscode: typeof import('vscode'), options: {
  root: string;
  rules: CompiledRule[];
  engine?: FlowEngine;
  onFindings(uri: import('vscode').Uri, candidates: Candidate[]): void;
  progress?: ScanProgress;
  token?: ScanToken;
}): Promise<WorkspaceScan | undefined> {
  const { root, rules, engine, progress, token } = options;
  const uris = await vscode.workspace.findFiles(SCAN_GLOB, SCAN_EXCLUDE_GLOB, 20000);
  const unsupported = (await vscode.workspace.findFiles(UNSUPPORTED_SOURCE_GLOB, SCAN_EXCLUDE_GLOB, 5000)).length;
  const scan: WorkspaceScan = { results: [], scanned: 0, skipped: 0, tests: 0, unsupported, filesByLanguage: {} };
  let total = 0;
  for (const [index, uri] of uris.entries()) {
    if (token?.isCancellationRequested) return undefined;
    if (index % 25 === 0) progress?.report({ message: `${index}/${uris.length}`, increment: (25 / Math.max(uris.length, 1)) * 100 });
    const language = languageForFile(uri.fsPath);
    if (!language) continue;
    const relative = path.relative(root, uri.fsPath).split(path.sep).join('/');
    // Test code is not reachable from outside, and its deliberate unsafe calls were most of the noise.
    if (engine?.isTestPath(relative)) {
      scan.tests++;
      continue;
    }
    try {
      const stat = await fs.stat(uri.fsPath);
      if (stat.size > SCAN_LIMITS.maxFileBytes) {
        scan.skipped++;
        continue;
      }
      const candidates = await scanFile(await fs.readFile(uri.fsPath, 'utf8'), language, uri.fsPath, rules, engine);
      scan.scanned++;
      scan.filesByLanguage[language] = (scan.filesByLanguage[language] ?? 0) + 1;
      if (candidates.length === 0) continue;
      options.onFindings(uri, candidates);
      scan.results.push({ file: relative, candidates });
      total += candidates.length;
      if (total >= SCAN_LIMITS.maxTotalCandidates) break;
    } catch {
      scan.skipped++;
    }
  }
  return scan;
}

module.exports = { scanWorkspaceFiles };
