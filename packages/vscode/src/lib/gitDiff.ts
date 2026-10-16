import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveIssueFilePath } from './diagnostics';
import type { AnalysisResult } from './engine';

export function parseGitStatusPorcelain(output: string, repoPath: string): string[] {
  const files = new Set<string>();
  for (const rawLine of (output || '').split(/\r?\n/)) {
    if (rawLine.length < 4) continue;
    const status = rawLine.slice(0, 2);
    if (status.includes('D')) continue;
    let relPath = rawLine.slice(3).trim();
    const arrowIdx = relPath.indexOf(' -> ');
    if (arrowIdx !== -1) {
      relPath = relPath.slice(arrowIdx + 4).trim();
    }
    if (relPath.startsWith('"') && relPath.endsWith('"')) {
      relPath = relPath.slice(1, -1);
    }
    if (relPath) {
      files.add(path.resolve(repoPath, relPath));
    }
  }
  return Array.from(files);
}

export function getGitChangedFiles(repoPath: string): string[] {
  const statusOut = execFileSync('git', ['status', '--porcelain', '-uall'], {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const uncommitted = parseGitStatusPorcelain(statusOut, repoPath).filter((p) => fs.existsSync(p));
  if (uncommitted.length > 0) {
    return uncommitted;
  }

  try {
    const diffOut = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD~1', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return diffOut
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((rel) => path.resolve(repoPath, rel))
      .filter((p) => fs.existsSync(p));
  } catch {
    return [];
  }
}

export function filterResultByChangedFiles(
  result: AnalysisResult,
  changedFiles: ReadonlyArray<string>
): AnalysisResult {
  const changedAbsSet = new Set(changedFiles.map((f) => path.resolve(result.repoPath, f)));
  const changedBaseSet = new Set(changedFiles.map((f) => path.basename(f)));

  const isChanged = (filePath: string) => {
    const abs = path.resolve(resolveIssueFilePath(result.repoPath, filePath));
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
  const circularDependencies = (result.circularDependencies || []).filter((cd) =>
    (cd.cycle || []).some((mod) => isChanged(mod) || changedBaseSet.has(path.basename(mod)))
  );

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

