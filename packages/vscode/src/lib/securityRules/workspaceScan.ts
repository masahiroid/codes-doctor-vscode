import path from 'node:path';
import fs from 'node:fs/promises';
import { SCAN_EXCLUDE_GLOB, SCAN_GLOB, SCAN_LIMITS, UNSUPPORTED_SOURCE_GLOB, flowRulesOf, languageForFile, scanFile } from './scan';
import type { Candidate, CompiledRule, EndpointsByRule, FlowEngine, ProjectIndex } from './scan';
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
  /** Function summaries of the scanned files, for following calls into other files later. */
  index?: ProjectIndex;
}

/**
 * Scan the workspace files the rules can read. Test code and oversized files are counted, not
 * scanned; files in languages no rule supports are counted as well. Data-flow rules first summarize
 * every function of the scanned files, so a call into another file is followed; the summaries are
 * returned for scanning single files later. Returns undefined when cancelled.
 */
export async function scanWorkspaceFiles(vscode: typeof import('vscode'), options: {
  root: string;
  rules: CompiledRule[];
  engine?: FlowEngine;
  onFindings(uri: import('vscode').Uri, candidates: Candidate[]): void;
  progress?: ScanProgress;
  token?: ScanToken;
  /** Messages shown while the workspace is summarized and while files are scanned. */
  labels?: { summarizing: string; scanning: string };
}): Promise<WorkspaceScan | undefined> {
  const { root, rules, engine, progress, token } = options;
  const uris = await vscode.workspace.findFiles(SCAN_GLOB, SCAN_EXCLUDE_GLOB, 20000);
  const unsupported = (await vscode.workspace.findFiles(UNSUPPORTED_SOURCE_GLOB, SCAN_EXCLUDE_GLOB, 5000)).length;
  const scan: WorkspaceScan = { results: [], scanned: 0, skipped: 0, tests: 0, unsupported, filesByLanguage: {} };

  const selected: Array<{ uri: import('vscode').Uri; language: string; relative: string }> = [];
  for (const uri of uris) {
    const language = languageForFile(uri.fsPath);
    if (!language) continue;
    const relative = path.relative(root, uri.fsPath).split(path.sep).join('/');
    // Test code is not reachable from outside, and its deliberate unsafe calls were most of the noise.
    if (engine?.isTestPath(relative)) {
      scan.tests++;
      continue;
    }
    try {
      if ((await fs.stat(uri.fsPath)).size > SCAN_LIMITS.maxFileBytes) {
        scan.skipped++;
        continue;
      }
    } catch {
      scan.skipped++;
      continue;
    }
    selected.push({ uri, language, relative });
  }

  const flowRules = flowRulesOf(rules);
  if (engine && flowRules.length > 0) {
    progress?.report({ message: options.labels?.summarizing });
    const read = async (file: string) => {
      if (token?.isCancellationRequested) throw new Error('cancelled');
      return fs.readFile(file, 'utf8');
    };
    scan.index = await engine.buildTaintRuleIndex(flowRules.map((item) => item.taint), selected.map((file) => ({ path: file.uri.fsPath, language: file.language })), read);
  }

  let total = 0;
  for (const [position, { uri, language, relative }] of selected.entries()) {
    if (token?.isCancellationRequested) return undefined;
    if (position % 25 === 0) {
      progress?.report({ message: `${options.labels?.scanning ?? ''} ${position}/${selected.length}`.trim(), increment: (25 / Math.max(selected.length, 1)) * 100 });
    }
    try {
      const endpoints: EndpointsByRule = new Map();
      const candidates = await scanFile(await fs.readFile(uri.fsPath, 'utf8'), language, uri.fsPath, rules, engine, scan.index, endpoints);
      scan.scanned++;
      scan.filesByLanguage[language] = (scan.filesByLanguage[language] ?? 0) + 1;
      if (candidates.length === 0 && endpoints.size === 0) continue;
      if (candidates.length > 0) options.onFindings(uri, candidates);
      scan.results.push({ file: relative, candidates, ...(endpoints.size > 0 ? { endpoints: Object.fromEntries(endpoints) } : {}) });
      total += candidates.length;
      if (total >= SCAN_LIMITS.maxTotalCandidates) break;
    } catch {
      scan.skipped++;
    }
  }
  return token?.isCancellationRequested ? undefined : scan;
}

module.exports = { scanWorkspaceFiles };
