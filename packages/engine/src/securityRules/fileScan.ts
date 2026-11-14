import path from 'node:path';
import fs from 'node:fs/promises';
import { SCAN_LIMITS, flowRulesOf, languageForFile, scanFile } from './scan';
import type { Candidate, CompiledRule, EndpointsByRule, FlowEngine, ProjectIndex } from './scan';
import type { FileCandidates } from './audit';

/** Scanning a set of files with compiled rules: shared by the extension (VS Code file search) and the CLI (directory walk). */

export type ScanProgress = { report(value: { message?: string; increment?: number }): void };
export type ScanToken = { isCancellationRequested: boolean };

/** What a scan found and what it covered, so an empty result can be read correctly. */
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

/** Directories never scanned; the same set the extension excludes from its file search. */
export const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', '.git', 'dist', 'dist-en', 'out', 'build', 'coverage', 'vendor', '.venv', '.codes-doctor']);
const UNSUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.kt', '.kts', '.rb', '.swift', '.dart', '.scala']);
const MAX_FILES = 20000;

/**
 * The files under `root` the rules can read, and the count of source files in languages no rule
 * supports. Symbolic links are not followed, so a link cannot pull files from outside the folder in.
 */
export async function listSourceFiles(root: string): Promise<{ files: string[]; unsupported: number }> {
  const files: string[] = [];
  let unsupported = 0;
  const pending = [root];
  while (pending.length > 0 && files.length < MAX_FILES) {
    const directory = pending.pop() as string;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) pending.push(full);
      } else if (entry.isFile()) {
        if (languageForFile(entry.name)) files.push(full);
        else if (UNSUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) unsupported++;
      }
    }
  }
  return { files: files.slice(0, MAX_FILES).sort(), unsupported };
}

/**
 * Scan the given files. Test code and oversized files are counted, not scanned. Data-flow rules
 * first summarize every function of the scanned files, so a call into another file is followed;
 * the summaries are returned for scanning single files later. Returns undefined when cancelled.
 */
export async function scanFiles(options: {
  root: string;
  files: string[];
  unsupported: number;
  rules: CompiledRule[];
  engine?: FlowEngine;
  onFindings?(file: string, candidates: Candidate[]): void;
  progress?: ScanProgress;
  token?: ScanToken;
  /** Messages shown while the files are summarized and while they are scanned. */
  labels?: { summarizing: string; scanning: string };
}): Promise<WorkspaceScan | undefined> {
  const { root, rules, engine, progress, token } = options;
  const scan: WorkspaceScan = { results: [], scanned: 0, skipped: 0, tests: 0, unsupported: options.unsupported, filesByLanguage: {} };

  const selected: Array<{ file: string; language: string; relative: string }> = [];
  for (const file of options.files) {
    const language = languageForFile(file);
    if (!language) continue;
    const relative = path.relative(root, file).split(path.sep).join('/');
    // Test code is not reachable from outside, and its deliberate unsafe calls were most of the noise.
    if (engine?.isTestPath(relative)) {
      scan.tests++;
      continue;
    }
    try {
      if ((await fs.stat(file)).size > SCAN_LIMITS.maxFileBytes) {
        scan.skipped++;
        continue;
      }
    } catch {
      scan.skipped++;
      continue;
    }
    selected.push({ file, language, relative });
  }

  const flowRules = flowRulesOf(rules);
  if (engine && flowRules.length > 0) {
    progress?.report({ message: options.labels?.summarizing });
    const read = async (file: string) => {
      if (token?.isCancellationRequested) throw new Error('cancelled');
      return fs.readFile(file, 'utf8');
    };
    scan.index = await engine.buildTaintRuleIndex(flowRules.map((item) => item.taint), selected.map((item) => ({ path: item.file, language: item.language })), read);
  }

  let total = 0;
  for (const [position, { file, language, relative }] of selected.entries()) {
    if (token?.isCancellationRequested) return undefined;
    if (position % 25 === 0) {
      progress?.report({ message: `${options.labels?.scanning ?? ''} ${position}/${selected.length}`.trim(), increment: (25 / Math.max(selected.length, 1)) * 100 });
    }
    try {
      const endpoints: EndpointsByRule = new Map();
      const candidates = await scanFile(await fs.readFile(file, 'utf8'), language, file, rules, engine, scan.index, endpoints);
      scan.scanned++;
      scan.filesByLanguage[language] = (scan.filesByLanguage[language] ?? 0) + 1;
      if (candidates.length === 0 && endpoints.size === 0) continue;
      if (candidates.length > 0) options.onFindings?.(file, candidates);
      scan.results.push({ file: relative, candidates, ...(endpoints.size > 0 ? { endpoints: Object.fromEntries(endpoints) } : {}) });
      total += candidates.length;
      if (total >= SCAN_LIMITS.maxTotalCandidates) break;
    } catch {
      scan.skipped++;
    }
  }
  return token?.isCancellationRequested ? undefined : scan;
}
