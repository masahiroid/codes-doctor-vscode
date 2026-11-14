import { rulesModule } from './rules';
import type { Candidate, CompiledRule, FlowEngine, ScanProgress, ScanToken, WorkspaceScan } from './rules';

export type { ScanProgress, ScanToken, WorkspaceScan } from './rules';

/** The workspace's file list from VS Code's file search, scanned by the engine's shared loop. */
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
  const { SCAN_EXCLUDE_GLOB, SCAN_GLOB, UNSUPPORTED_SOURCE_GLOB, scanFiles } = rulesModule();
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
      if (uri) options.onFindings(uri, candidates);
    },
    progress: options.progress,
    token: options.token,
    labels: options.labels,
  });
}

module.exports = { scanWorkspaceFiles };
